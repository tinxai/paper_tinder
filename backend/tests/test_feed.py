"""Discovery feed: ranking, swipe exclusion, caching, pagination, failures."""

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.errors import ExternalServiceError
from app.models import Paper
from app.services.semantic_scholar import RateLimitedError
from tests.conftest import make_raw_paper


async def set_interests(auth_client: AsyncClient, names: list[str]) -> None:
    response = await auth_client.put("/api/v1/users/me/interests", json={"names": names})
    assert response.status_code == 200


# --- basics -------------------------------------------------------------


async def test_feed_is_empty_before_onboarding(auth_client: AsyncClient, scholar):
    """No interests chosen yet — an empty feed, not an error."""
    scholar.raw_search_results = [make_raw_paper()]

    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 200
    assert response.json()["items"] == []
    # No interests means no upstream call at all.
    assert scholar.search_calls == []


async def test_feed_returns_papers_for_the_users_interests(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])

    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 200

    body = response.json()
    assert [p["id"] for p in body["items"]] == ["paper-001"]
    assert body["items"][0]["title"] == "Attention Is All You Need"
    assert scholar.search_calls == ["Robotics"]


async def test_feed_queries_each_interest(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics", "Computer Vision"])

    await auth_client.get("/api/v1/papers/feed")
    assert sorted(scholar.search_calls) == ["Computer Vision", "Robotics"]


async def test_feed_caps_how_many_interests_it_queries(auth_client: AsyncClient, scholar):
    """A user with many interests must not fan out one call per interest."""
    from app.services.feed import MAX_INTERESTS_PER_REQUEST

    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, [f"Topic {i}" for i in range(12)])

    await auth_client.get("/api/v1/papers/feed")
    assert len(scholar.search_calls) == MAX_INTERESTS_PER_REQUEST


async def test_feed_deduplicates_papers_across_interests(auth_client: AsyncClient, scholar):
    """The same paper returned for two interests appears once."""
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics", "Computer Vision"])

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in body["items"]] == ["paper-001"]


async def test_feed_requires_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/papers/feed")).status_code == 401


# --- excluding swiped papers (core acceptance criterion) ----------------


async def test_feed_never_shows_an_already_swiped_paper(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(paperId="seen"),
        make_raw_paper(paperId="unseen"),
    ]
    await set_interests(auth_client, ["Robotics"])

    await auth_client.post("/api/v1/swipes", json={"paper_id": "seen", "direction": "right"})

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in body["items"]] == ["unseen"]


async def test_feed_excludes_both_left_and_right_swipes(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(paperId="saved"),
        make_raw_paper(paperId="dismissed"),
        make_raw_paper(paperId="fresh"),
    ]
    await set_interests(auth_client, ["Robotics"])

    await auth_client.post("/api/v1/swipes", json={"paper_id": "saved", "direction": "right"})
    await auth_client.post("/api/v1/swipes", json={"paper_id": "dismissed", "direction": "left"})

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in body["items"]] == ["fresh"]


async def test_feed_exclusion_is_per_user(client: AsyncClient, scholar):
    from tests.conftest import auth_headers, register_user

    scholar.raw_search_results = [make_raw_paper()]

    first = await register_user(client, email="one@example.com")
    first_headers = auth_headers(first["access_token"])
    await client.put(
        "/api/v1/users/me/interests", json={"names": ["Robotics"]}, headers=first_headers
    )
    await client.post(
        "/api/v1/swipes",
        json={"paper_id": "paper-001", "direction": "right"},
        headers=first_headers,
    )
    assert (await client.get("/api/v1/papers/feed", headers=first_headers)).json()["items"] == []

    # A second user has not seen it, so it is still in their feed.
    second = await register_user(client, email="two@example.com")
    second_headers = auth_headers(second["access_token"])
    await client.put(
        "/api/v1/users/me/interests", json={"names": ["Robotics"]}, headers=second_headers
    )
    body = (await client.get("/api/v1/papers/feed", headers=second_headers)).json()
    assert [p["id"] for p in body["items"]] == ["paper-001"]


async def test_feed_is_empty_once_everything_has_been_swiped(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])

    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "left"})

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert body["items"] == []
    assert body["has_more"] is False


# --- caching ------------------------------------------------------------


async def test_feed_caches_paper_metadata_in_postgres(auth_client: AsyncClient, scholar, db):
    """Saved papers and detail views must not depend on the upstream."""
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])
    await auth_client.get("/api/v1/papers/feed")

    cached = await db.get(Paper, "paper-001")
    assert cached is not None
    assert cached.title == "Attention Is All You Need"
    assert cached.citation_count == 100000


async def test_feed_caches_papers_that_get_filtered_out(auth_client: AsyncClient, scholar, db):
    """A swiped-past paper still needs a row for the swipe's foreign key."""
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])
    await auth_client.get("/api/v1/papers/feed")
    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"})
    await auth_client.get("/api/v1/papers/feed")

    assert await db.get(Paper, "paper-001") is not None


async def test_refetching_updates_cached_metadata(auth_client: AsyncClient, scholar, db):
    scholar.raw_search_results = [make_raw_paper(citationCount=10)]
    await set_interests(auth_client, ["Robotics"])
    await auth_client.get("/api/v1/papers/feed")

    scholar.raw_search_results = [make_raw_paper(citationCount=999)]
    await auth_client.get("/api/v1/papers/feed")

    rows = (await db.execute(select(Paper).where(Paper.id == "paper-001"))).scalars().all()
    assert len(rows) == 1  # upserted, not duplicated
    await db.refresh(rows[0])
    assert rows[0].citation_count == 999


# --- ranking integration ------------------------------------------------


async def test_feed_is_ordered_by_score(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(paperId="irrelevant", title="Lattice QCD", year=1995, citationCount=3),
        make_raw_paper(
            paperId="relevant",
            title="Robotics for manipulation",
            year=2026,
            citationCount=400,
        ),
    ]
    await set_interests(auth_client, ["Robotics"])

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in body["items"]] == ["relevant", "irrelevant"]


async def test_feed_exposes_score_and_matched_interests(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper(title="Robotics at scale")]
    await set_interests(auth_client, ["Robotics"])

    paper = (await auth_client.get("/api/v1/papers/feed")).json()["items"][0]
    assert 0 <= paper["score"] <= 1
    assert paper["matched_interests"] == ["Robotics"]


# --- pagination ---------------------------------------------------------


async def test_feed_paginates_without_repeating_papers(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper(paperId=f"p{i}") for i in range(10)]
    await set_interests(auth_client, ["Robotics"])

    first = (await auth_client.get("/api/v1/papers/feed", params={"limit": 4})).json()
    second = (await auth_client.get("/api/v1/papers/feed", params={"limit": 4, "offset": 4})).json()

    assert len(first["items"]) == 4
    assert first["has_more"] is True
    assert len(second["items"]) == 4

    first_ids = {p["id"] for p in first["items"]}
    second_ids = {p["id"] for p in second["items"]}
    assert first_ids.isdisjoint(second_ids)


async def test_feed_has_more_is_false_on_the_last_page(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper(paperId=f"p{i}") for i in range(3)]
    await set_interests(auth_client, ["Robotics"])

    body = (await auth_client.get("/api/v1/papers/feed", params={"limit": 10})).json()
    assert len(body["items"]) == 3
    assert body["has_more"] is False


async def test_feed_total_is_null(auth_client: AsyncClient, scholar):
    """The upstream result set is not enumerable, so a total would be a lie."""
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])

    assert (await auth_client.get("/api/v1/papers/feed")).json()["total"] is None


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 500}, {"offset": -1}])
async def test_feed_rejects_invalid_pagination(auth_client: AsyncClient, params):
    assert (await auth_client.get("/api/v1/papers/feed", params=params)).status_code == 422


# --- upstream failures --------------------------------------------------


async def test_feed_surfaces_a_total_upstream_failure_with_an_empty_cache(
    auth_client: AsyncClient, scholar
):
    """Nothing live and nothing cached — the app needs a 503 to show Retry."""
    await set_interests(auth_client, ["Robotics"])
    scholar.error = ExternalServiceError()

    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "external_service_unavailable"


async def test_feed_surfaces_an_upstream_rate_limit(auth_client: AsyncClient, scholar):
    """A 429 must stay distinguishable from a generic outage."""
    await set_interests(auth_client, ["Robotics"])
    scholar.error = RateLimitedError()

    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "upstream_rate_limited"


# --- cache fallback -----------------------------------------------------


async def test_feed_marks_live_results_as_live(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper(title="Robotics")]
    await set_interests(auth_client, ["Robotics"])

    assert (await auth_client.get("/api/v1/papers/feed")).json()["source"] == "live"


async def test_feed_falls_back_to_the_cache_when_upstream_fails(auth_client: AsyncClient, scholar):
    """The public API is rate-limited by default, so this is a normal path."""
    scholar.raw_search_results = [make_raw_paper(title="Robotics for manipulation")]
    await set_interests(auth_client, ["Robotics"])

    # Warm the cache while upstream works.
    first = (await auth_client.get("/api/v1/papers/feed")).json()
    assert first["source"] == "live"

    # Now upstream is down entirely.
    scholar.error = RateLimitedError()
    second = (await auth_client.get("/api/v1/papers/feed")).json()

    assert second["source"] == "cache"
    assert [p["id"] for p in second["items"]] == ["paper-001"]


async def test_cache_fallback_still_excludes_swiped_papers(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(paperId="kept", title="Robotics one"),
        make_raw_paper(paperId="swiped", title="Robotics two"),
    ]
    await set_interests(auth_client, ["Robotics"])
    await auth_client.get("/api/v1/papers/feed")
    await auth_client.post("/api/v1/swipes", json={"paper_id": "swiped", "direction": "left"})

    scholar.error = RateLimitedError()
    body = (await auth_client.get("/api/v1/papers/feed")).json()

    assert body["source"] == "cache"
    assert [p["id"] for p in body["items"]] == ["kept"]


async def test_cache_fallback_excludes_papers_unrelated_to_the_users_interests(
    auth_client: AsyncClient, scholar, db
):
    """The cache is global, so an unrelated paper must not leak into the feed."""
    from app.services.papers import upsert_papers
    from app.services.semantic_scholar import normalize_paper

    await upsert_papers(
        db,
        [
            normalize_paper(make_raw_paper(paperId="match", title="Robotics manipulation")),
            normalize_paper(make_raw_paper(paperId="unrelated", title="Lattice QCD")),
        ],
    )
    await db.commit()

    await set_interests(auth_client, ["Robotics"])
    scholar.error = RateLimitedError()

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert body["source"] == "cache"
    assert [p["id"] for p in body["items"]] == ["match"]


async def test_cache_fallback_raises_when_nothing_relevant_is_cached(
    auth_client: AsyncClient, scholar, db
):
    from app.services.papers import upsert_papers
    from app.services.semantic_scholar import normalize_paper

    await upsert_papers(
        db, [normalize_paper(make_raw_paper(paperId="unrelated", title="Lattice QCD"))]
    )
    await db.commit()

    await set_interests(auth_client, ["Robotics"])
    scholar.error = RateLimitedError()

    # Cached papers exist but none match — an empty page, not a crash.
    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_feed_survives_a_partial_upstream_failure(auth_client: AsyncClient, scholar):
    """One failing interest query must not blank the whole feed."""
    from app.services.feed import fetch_candidates

    class PartiallyFailingClient:
        async def search_papers(self, query: str, limit: int = 20, offset: int = 0):
            if query == "Broken":
                raise ExternalServiceError()
            from app.services.semantic_scholar import normalize_paper

            return [normalize_paper(make_raw_paper(paperId="survivor"))]

    papers, failures, first_error = await fetch_candidates(
        PartiallyFailingClient(), ["Broken", "Robotics"], 20
    )
    assert failures == 1
    assert isinstance(first_error, ExternalServiceError)
    assert [p.id for p in papers] == ["survivor"]


async def test_feed_is_empty_not_an_error_when_upstream_returns_nothing(
    auth_client: AsyncClient, scholar
):
    scholar.raw_search_results = []
    await set_interests(auth_client, ["Extremely Obscure Topic"])

    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_feed_drops_malformed_upstream_records(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(paperId="good"),
        {"title": "no id at all"},
        None,
        "a string",
        {},
    ]
    await set_interests(auth_client, ["Robotics"])

    body = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in body["items"]] == ["good"]


async def test_feed_handles_papers_with_no_abstract_or_pdf(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [
        make_raw_paper(
            abstract=None,
            openAccessPdf=None,
            venue=None,
            year=None,
            publicationDate=None,  # else `year` legitimately backfills from it
        )
    ]
    await set_interests(auth_client, ["Robotics"])

    paper = (await auth_client.get("/api/v1/papers/feed")).json()["items"][0]
    assert paper["abstract"] is None
    assert paper["pdf_url"] is None
    assert paper["venue"] is None
    assert paper["year"] is None


async def test_feed_timeout_reaches_the_client_as_503(auth_client: AsyncClient, scholar):
    """End-to-end: an httpx timeout becomes a clean 503, not a 500."""
    await set_interests(auth_client, ["Robotics"])
    scholar.error = httpx.ConnectTimeout("upstream timed out")

    response = await auth_client.get("/api/v1/papers/feed")
    # A raw httpx error escaping would be a 500; the service layer must convert it.
    assert response.status_code == 503


# --- paper detail -------------------------------------------------------


async def test_paper_detail_is_served_from_the_cache(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = [make_raw_paper()]
    await set_interests(auth_client, ["Robotics"])
    await auth_client.get("/api/v1/papers/feed")
    scholar.detail_calls.clear()

    response = await auth_client.get("/api/v1/papers/paper-001")
    assert response.status_code == 200
    assert response.json()["title"] == "Attention Is All You Need"
    # Cached — no upstream round trip.
    assert scholar.detail_calls == []


async def test_paper_detail_falls_back_to_upstream_on_a_cache_miss(
    auth_client: AsyncClient, scholar, db
):
    scholar.raw_detail_result = make_raw_paper(paperId="uncached")

    response = await auth_client.get("/api/v1/papers/uncached")
    assert response.status_code == 200
    assert scholar.detail_calls == ["uncached"]
    # And it is cached for next time.
    assert await db.get(Paper, "uncached") is not None


async def test_paper_detail_404s_for_an_unknown_paper(auth_client: AsyncClient, scholar):
    scholar.raw_detail_result = None
    response = await auth_client.get("/api/v1/papers/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_paper_detail_requires_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/papers/paper-001")).status_code == 401
