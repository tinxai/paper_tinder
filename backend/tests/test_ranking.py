"""Ranking logic. Pure functions — no database, no network."""

from datetime import date

from app.services.ranking import (
    CITATION_LOG_CEILING,
    RECENCY_WINDOW_YEARS,
    WEIGHT_CITATIONS,
    WEIGHT_INTEREST_MATCH,
    WEIGHT_RECENCY,
    citation_score,
    interest_match_score,
    rank_papers,
    recency_score,
    score_paper,
    tokenize,
)
from app.services.semantic_scholar import NormalizedPaper

TODAY = date(2026, 1, 1)


def paper(**kwargs) -> NormalizedPaper:
    defaults = {
        "id": "p1",
        "title": "A paper",
        "abstract": None,
        "year": 2026,
        "venue": None,
        "citation_count": 0,
        "fields_of_study": [],
    }
    defaults.update(kwargs)
    return NormalizedPaper(**defaults)


# --- weights ------------------------------------------------------------


def test_weights_sum_to_one():
    total = WEIGHT_INTEREST_MATCH + WEIGHT_RECENCY + WEIGHT_CITATIONS
    assert abs(total - 1.0) < 1e-9


# --- tokenization -------------------------------------------------------


def test_tokenize_drops_stopwords_and_single_chars():
    assert tokenize("A Novel Approach to Robotics") == {"robotics"}


def test_tokenize_handles_none_and_empty():
    assert tokenize(None) == set()
    assert tokenize("") == set()


def test_tokenize_splits_on_punctuation():
    assert tokenize("vision-language models") == {"vision", "language", "models"}


# --- interest match -----------------------------------------------------


def test_interest_match_rewards_title_hits():
    in_title = paper(title="Explainable AI for clinicians")
    in_abstract = paper(title="Some clinical study", abstract="We discuss explainable AI.")

    title_score, _ = interest_match_score(in_title, ["Explainable AI"])
    abstract_score, _ = interest_match_score(in_abstract, ["Explainable AI"])
    assert title_score > abstract_score


def test_interest_match_uses_best_interest_not_the_mean():
    """One strong match should not be diluted by unrelated interests."""
    p = paper(title="Deep Reinforcement Learning for Robotics")

    alone, _ = interest_match_score(p, ["Robotics"])
    with_others, _ = interest_match_score(
        p, ["Robotics", "Natural Language Processing", "Computer Vision"]
    )
    assert with_others == alone


def test_interest_match_reports_which_interests_matched():
    p = paper(title="Computer Vision for Robotics", abstract="Vision-based control.")
    _, matched = interest_match_score(p, ["Robotics", "Natural Language Processing"])
    assert matched == ["Robotics"]


def test_interest_match_is_zero_with_no_interests():
    assert interest_match_score(paper(), []) == (0.0, [])


def test_interest_match_is_zero_with_no_overlap():
    p = paper(title="Quantum chromodynamics on the lattice")
    score, matched = interest_match_score(p, ["Human-Computer Interaction"])
    assert score == 0.0
    assert matched == []


def test_interest_match_searches_fields_of_study_and_venue():
    p = paper(title="An untitled contribution", fields_of_study=["Robotics"])
    score, _ = interest_match_score(p, ["Robotics"])
    assert score > 0


def test_interest_match_partial_coverage_scores_between_zero_and_one():
    # "Vision-Language Models" -> {vision, language, models}; only `vision` hits.
    p = paper(title="Vision transformers for segmentation")
    score, matched = interest_match_score(p, ["Vision-Language Models"])
    assert 0 < score < 1
    assert matched == []  # below the 0.5 coverage bar


def test_interest_match_is_case_insensitive():
    upper, _ = interest_match_score(paper(title="ROBOTICS AT SCALE"), ["robotics"])
    lower, _ = interest_match_score(paper(title="robotics at scale"), ["ROBOTICS"])
    assert upper == lower > 0


# --- recency ------------------------------------------------------------


def test_recency_is_one_for_the_current_year():
    assert recency_score(paper(year=2026), today=TODAY) == 1.0


def test_recency_decays_with_age():
    newer = recency_score(paper(year=2024), today=TODAY)
    older = recency_score(paper(year=2020), today=TODAY)
    assert 0 < older < newer < 1.0


def test_recency_is_zero_beyond_the_window():
    ancient = paper(year=TODAY.year - RECENCY_WINDOW_YEARS - 5)
    assert recency_score(ancient, today=TODAY) == 0.0


def test_recency_is_neutral_when_year_is_missing():
    """Missing metadata must neither promote nor bury a paper."""
    assert recency_score(paper(year=None), today=TODAY) == 0.5


def test_recency_handles_future_dated_preprints():
    assert recency_score(paper(year=2027), today=TODAY) == 1.0


# --- citations ----------------------------------------------------------


def test_citation_score_is_log_compressed_not_linear():
    """The whole point of the log transform: 100x citations != 100x score."""
    hundred = citation_score(paper(citation_count=100))
    ten_thousand = citation_score(paper(citation_count=10_000))

    assert ten_thousand > hundred
    # Linear would be 100x; log keeps it to a modest multiple.
    assert ten_thousand / hundred < 3


def test_citation_score_saturates_and_never_exceeds_one():
    assert citation_score(paper(citation_count=10**9)) == 1.0
    assert citation_score(paper(citation_count=10 ** int(CITATION_LOG_CEILING))) <= 1.0


def test_citation_score_is_zero_for_uncited_papers():
    assert citation_score(paper(citation_count=0)) == 0.0


def test_citation_score_handles_negative_counts_defensively():
    assert citation_score(paper(citation_count=-5)) == 0.0


# --- combined scoring ---------------------------------------------------


def test_score_is_bounded_between_zero_and_one():
    best = paper(title="Robotics", year=2026, citation_count=10**7)
    worst = paper(title="Lattice QCD", year=1970, citation_count=0)

    assert score_paper(best, ["Robotics"], today=TODAY).score <= 1.0
    assert score_paper(worst, ["Robotics"], today=TODAY).score >= 0.0


def test_relevant_recent_paper_outranks_an_ancient_blockbuster():
    """The specific failure the log transform exists to prevent."""
    blockbuster = paper(
        id="old",
        title="A mathematical theory of communication",
        year=1948,
        citation_count=200_000,
    )
    relevant = paper(
        id="new",
        title="Web Agents that browse autonomously",
        abstract="We study web agents.",
        year=2026,
        citation_count=12,
    )

    ranked = rank_papers([blockbuster, relevant], ["Web Agents"], today=TODAY)
    assert ranked[0].paper.id == "new"


def test_rank_papers_sorts_descending_by_score():
    papers = [
        paper(id="a", title="Robotics", year=2026, citation_count=500),
        paper(id="b", title="Unrelated topic", year=1990, citation_count=0),
        paper(id="c", title="Robotics survey", year=2024, citation_count=50),
    ]
    ranked = rank_papers(papers, ["Robotics"], today=TODAY)

    scores = [r.score for r in ranked]
    assert scores == sorted(scores, reverse=True)
    assert ranked[-1].paper.id == "b"


def test_rank_papers_is_deterministic_on_ties():
    """Stable ordering is what makes offset pagination safe."""
    tied = [paper(id="z", title="Same"), paper(id="a", title="Same")]

    first = [r.paper.id for r in rank_papers(tied, ["Same"], today=TODAY)]
    second = [r.paper.id for r in rank_papers(list(reversed(tied)), ["Same"], today=TODAY)]

    assert first == second == ["a", "z"]  # tie broken on paper ID


def test_rank_papers_on_empty_input():
    assert rank_papers([], ["Robotics"], today=TODAY) == []


def test_scored_paper_exposes_its_components():
    result = score_paper(
        paper(title="Robotics", year=2026, citation_count=100), ["Robotics"], today=TODAY
    )
    assert 0 <= result.interest_match <= 1
    assert 0 <= result.recency <= 1
    assert 0 <= result.citation_impact <= 1
    assert result.matched_interests == ["Robotics"]
