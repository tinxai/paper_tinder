"""Paper ranking for the discovery feed.

This module is deliberately self-contained and has no database or HTTP
dependencies: it takes normalized papers plus the user's interest strings and
returns scored papers. That boundary is what makes it replaceable — a v2
embedding-based recommender only has to expose the same `rank_papers()`
signature (see docs/version-2.md).

The v1 score is a weighted sum of three normalized (0..1) signals:

    score = 0.50 * interest_match + 0.20 * recency + 0.30 * citation_impact

Weights are constants below rather than magic numbers inline, so they can be
tuned (or A/B tested) in one place.

Why a log transform on citations: citation counts are power-law distributed. A
single 40,000-citation survey would otherwise outrank every recent, relevant
paper forever. `log10(1 + citations)` compresses that range so a 10,000-cite
paper scores ~1.33x a 100-cite paper rather than 100x.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date

from app.services.semantic_scholar import NormalizedPaper

# --- Tunable weights (must sum to 1.0) ---
WEIGHT_INTEREST_MATCH = 0.50
WEIGHT_RECENCY = 0.20
WEIGHT_CITATIONS = 0.30

# Papers older than this contribute no recency signal.
RECENCY_WINDOW_YEARS = 12

# How much an interest term counts when it appears only in the abstract /
# venue / fields of study rather than in the title.
TITLE_TOKEN_WEIGHT = 1.0
BODY_TOKEN_WEIGHT = 0.6

# An interest must reach this coverage to be reported as "matched" to the client.
MATCHED_INTEREST_THRESHOLD = 0.5

# log10(1 + citations) is divided by this to map into 0..1.
# log10(1 + 10_000) ≈ 4.0, so 10k+ citations saturates the signal.
CITATION_LOG_CEILING = 4.0

# Words too common in CS abstracts to carry signal in a match score.
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "has",
        "in",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "that",
        "the",
        "to",
        "we",
        "with",
        "using",
        "use",
        "based",
        "via",
        "towards",
        "toward",
        "new",
        "novel",
        "approach",
        "method",
        "methods",
        "paper",
        "study",
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str | None) -> set[str]:
    """Lowercase alphanumeric tokens, minus stopwords and 1-character noise."""
    if not text:
        return set()
    return {
        token
        for token in _TOKEN_RE.findall(text.lower())
        if len(token) > 1 and token not in _STOPWORDS
    }


@dataclass(slots=True)
class ScoredPaper:
    paper: NormalizedPaper
    score: float
    matched_interests: list[str]
    # Kept for debugging and for the /feed response's explainability fields.
    interest_match: float
    recency: float
    citation_impact: float


def interest_match_score(paper: NormalizedPaper, interests: list[str]) -> tuple[float, list[str]]:
    """Weighted-overlap score between the paper's text and the user's interests.

    Each token of an interest is scored by *where* it appears in the paper: a
    term in the title is a far stronger signal than the same term buried in an
    abstract, so title hits carry full weight and body-only hits carry
    BODY_TOKEN_WEIGHT. An interest's score is the weighted share of its tokens
    that hit, so a full title match scores 1.0 and a full abstract-only match
    scores BODY_TOKEN_WEIGHT.

    The paper's score is the *best* single interest match, not the mean: a paper
    that nails one of a user's five interests should rank highly, not be
    penalized for ignoring the other four.
    """
    if not interests:
        return 0.0, []

    title_tokens = tokenize(paper.title)
    body_tokens = (
        tokenize(paper.abstract) | tokenize(paper.venue) | tokenize(" ".join(paper.fields_of_study))
    )
    if not (title_tokens | body_tokens):
        return 0.0, []

    best = 0.0
    matched: list[str] = []
    for interest in interests:
        interest_tokens = tokenize(interest)
        if not interest_tokens:
            continue

        weight = 0.0
        for token in interest_tokens:
            if token in title_tokens:
                weight += TITLE_TOKEN_WEIGHT
            elif token in body_tokens:
                weight += BODY_TOKEN_WEIGHT
        if weight == 0.0:
            continue

        coverage = min(1.0, weight / len(interest_tokens))

        # Count it as "matched" only when a meaningful share of the interest hit.
        if coverage >= MATCHED_INTEREST_THRESHOLD:
            matched.append(interest)
        best = max(best, coverage)

    return best, matched


def recency_score(paper: NormalizedPaper, today: date | None = None) -> float:
    """1.0 for this year, decaying linearly to 0.0 at RECENCY_WINDOW_YEARS old.

    Papers with no year get 0.5 — neutral, so missing metadata neither
    promotes nor buries a paper.
    """
    current_year = (today or date.today()).year
    if paper.year is None:
        return 0.5
    age = current_year - paper.year
    if age < 0:  # preprints dated next year
        age = 0
    if age >= RECENCY_WINDOW_YEARS:
        return 0.0
    return 1.0 - (age / RECENCY_WINDOW_YEARS)


def citation_score(paper: NormalizedPaper) -> float:
    """Log-compressed citation impact, clamped to 0..1.

    See the module docstring for why the log transform matters.
    """
    citations = max(0, paper.citation_count or 0)
    return min(1.0, math.log10(1 + citations) / CITATION_LOG_CEILING)


def score_paper(
    paper: NormalizedPaper, interests: list[str], today: date | None = None
) -> ScoredPaper:
    match, matched_interests = interest_match_score(paper, interests)
    recency = recency_score(paper, today=today)
    citations = citation_score(paper)

    total = WEIGHT_INTEREST_MATCH * match + WEIGHT_RECENCY * recency + WEIGHT_CITATIONS * citations
    return ScoredPaper(
        paper=paper,
        score=round(total, 6),
        matched_interests=matched_interests,
        interest_match=round(match, 6),
        recency=round(recency, 6),
        citation_impact=round(citations, 6),
    )


def rank_papers(
    papers: list[NormalizedPaper],
    interests: list[str],
    today: date | None = None,
) -> list[ScoredPaper]:
    """Score and sort papers, best first.

    Ties break on paper ID so the ordering is deterministic — important for
    stable pagination and for tests.
    """
    scored = [score_paper(paper, interests, today=today) for paper in papers]
    scored.sort(key=lambda s: (-s.score, s.paper.id))
    return scored
