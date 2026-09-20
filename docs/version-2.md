# Version 2: embedding-based recommendations with pgvector

This document explains how v1's deterministic ranking would be replaced by an
embedding-based recommender, and why v1 was structured the way it was.

Nothing here is implemented. It exists so the v1 code can be read with the v2
shape in mind.

---

## Why v1 ranks the way it does

v1 scores each paper with a weighted sum of three normalized signals:

```
score = 0.50 * interest_match + 0.20 * recency + 0.30 * citation_impact
```

This is **content-blind**: `interest_match` is token overlap between the user's
interest strings and the paper's text. It cannot tell that "vision-language
models" and "multimodal LLMs" are the same subject, and it cannot learn from
what the user actually saves.

That is the exact gap embeddings close.

## The seam v2 plugs into

`backend/app/services/ranking.py` has no database and no HTTP dependency. It is
a pure function:

```python
def rank_papers(
    papers: list[NormalizedPaper],
    interests: list[str],
    today: date | None = None,
) -> list[ScoredPaper]:
```

`build_feed()` in `services/feed.py` is the only caller. A v2 recommender that
satisfies the same contract can be swapped in behind a feature flag without
touching the API layer, the schemas, or the mobile app.

The signature grows one argument — the user, because the ranking now depends on
their swipe history:

```python
async def rank_papers(
    papers: list[NormalizedPaper],
    user: User,
    db: AsyncSession,
    today: date | None = None,
) -> list[ScoredPaper]:
```

## Schema changes

Enable the extension and add an embedding column:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE papers ADD COLUMN embedding vector(768);

-- HNSW beats IVFFlat for recall at this corpus size and needs no training step.
-- vector_cosine_ops because the embeddings are L2-normalized.
CREATE INDEX ix_papers_embedding
    ON papers USING hnsw (embedding vector_cosine_ops);
```

Caching each user's taste vector avoids recomputing it on every feed request:

```sql
CREATE TABLE user_preference_vectors (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    embedding     vector(768) NOT NULL,
    swipe_count   INTEGER     NOT NULL DEFAULT 0,  -- what it was built from
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Both are ordinary Alembic migrations. `papers.embedding` is nullable, so
existing rows stay valid and can be backfilled lazily.

Docker Compose would switch its image from `postgres:16-alpine` to
`pgvector/pgvector:pg16`.

## Where embeddings come from

Semantic Scholar's Academic Graph already serves SPECTER2 embeddings — ask for
the `embedding.specter_v2` field on the same `/paper/search` call v1 already
makes. That means **no new vendor, no model to host, and no per-request
inference cost**; the vector arrives with the metadata we already fetch and is
upserted alongside it.

The fallback, if a self-hosted model is preferred later, is to embed
`title + abstract` with a sentence-transformer in a background job. That is a
bigger operational step (a GPU or a slow CPU queue) and is the reason it is not
the first choice.

## Building the user vector

The signal is what the user swiped **right** on. A simple, defensible v2:

```python
async def build_user_vector(db: AsyncSession, user: User) -> np.ndarray | None:
    """Recency-weighted centroid of the papers the user saved.

    Recent saves count for more than old ones, so the feed tracks a user whose
    focus shifts rather than averaging over their whole history.
    """
    saved = await fetch_saved_paper_embeddings(db, user, limit=100)
    if not saved:
        return None  # cold start — fall back to v1 ranking

    # Exponential decay by save order: half-life of ~20 papers.
    weights = np.array([0.5 ** (i / 20) for i in range(len(saved))])
    vectors = np.stack([s.embedding for s in saved])

    centroid = np.average(vectors, axis=0, weights=weights)
    return centroid / np.linalg.norm(centroid)
```

Left swipes are deliberately **not** subtracted in the first cut. A left swipe
is ambiguous — "already read it", "not right now", "wrong subfield" — and
treating it as a negative example tends to collapse the feed's diversity. A
later iteration could subtract a small fraction of the dismissed centroid and
measure the effect.

## Retrieval and ranking

pgvector does the nearest-neighbour search in the database, so the candidate
set never has to be pulled into Python:

```sql
SELECT p.*, 1 - (p.embedding <=> :user_vector) AS similarity
FROM papers p
WHERE p.embedding IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM swipes s
      WHERE s.user_id = :user_id AND s.paper_id = p.id
  )
ORDER BY p.embedding <=> :user_vector   -- cosine distance; uses the HNSW index
LIMIT 200;
```

`<=>` is cosine distance, so `1 - distance` is cosine similarity in `0..1` —
directly substitutable for v1's `interest_match` term:

```
score = 0.55 * embedding_similarity
      + 0.15 * recency
      + 0.20 * citation_impact
      + 0.10 * diversity_bonus
```

The `diversity_bonus` is new and matters: a pure similarity ranking converges on
a single cluster and the feed gets boring. Penalising papers whose fields of
study already dominate the current page counteracts that.

## Cold start

A new user has no right swipes, so there is no vector to compare against. v2
keeps v1's ranking for exactly this case:

| User state | Ranking used |
|---|---|
| 0 saved papers | v1 keyword ranking (unchanged) |
| 1–4 saved papers | v1, blended with embedding similarity as it becomes meaningful |
| 5+ saved papers | embedding-first, with v1 as the fallback if the vector is missing |

This is why v1's ranking is worth keeping rather than deleting: it remains the
cold-start path forever.

## Keeping vectors fresh

Recomputing the user vector on every feed request would be wasteful. Instead,
recompute when `swipe_count` has drifted from the stored value by more than a
few swipes — a cheap comparison on a row we already read.

This is also the point where a queue starts to look tempting. It should be
resisted for as long as possible: the recompute is a centroid over at most 100
vectors, which takes single-digit milliseconds. Adding Redis or Celery here
would add an operational component to save nothing measurable.

---

## Other v2 features, and where they attach

The v1 code is organized so these slot in without restructuring:

**Paper summaries.** A `summaries` table keyed by `paper_id`, populated by a
background job. The generation call belongs in `services/`, alongside
`semantic_scholar.py`, so the API layer never calls a model directly.

**Daily notifications.** `expo-notifications` on the client, a `push_tokens`
table and a scheduled job server-side that runs the existing `build_feed()` and
notifies when it finds something above a score threshold. The ranking code is
reused as-is.

**Offline saved-paper reading.** SQLite on the device via `expo-sqlite`,
mirroring `GET /papers/saved`. PostgreSQL stays the source of truth; the local
database is a read cache with a sync timestamp. This is why v1 deliberately does
*not* use SQLite — until there is an offline requirement it is pure overhead.

**Social sharing.** `expo-sharing` plus the `paper_url` the app already stores.
No backend change at all.

**Multiple collections.** A `collections` table and a `collection_papers` join
table, with `swipes` unchanged. A right swipe would file into a default
collection, keeping the existing behaviour intact.
