"""Semantic Scholar client: normalization and failure handling.

Every request here is served by an httpx MockTransport. Nothing touches the
live API.
"""

from datetime import date

import httpx
import pytest

from app.core.errors import ExternalServiceError
from app.services.semantic_scholar import (
    RateLimitedError,
    SemanticScholarClient,
    normalize_paper,
)
from tests.conftest import make_raw_paper


def client_with(handler) -> SemanticScholarClient:
    return SemanticScholarClient(client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def json_response(payload, status_code: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=payload)

    return handler


# --- normalization: well-formed input -----------------------------------


def test_normalize_full_record():
    result = normalize_paper(make_raw_paper())

    assert result is not None
    assert result.id == "paper-001"
    assert result.title == "Attention Is All You Need"
    assert result.year == 2017
    assert result.publication_date == date(2017, 6, 12)
    assert result.venue == "NeurIPS"
    assert result.citation_count == 100000
    assert result.pdf_url == "https://arxiv.org/pdf/1706.03762.pdf"
    assert result.authors == [{"authorId": "1", "name": "Ashish Vaswani"}]
    assert result.fields_of_study == ["Computer Science"]


# --- normalization: malformed / partial input ---------------------------


@pytest.mark.parametrize(
    "bad",
    [
        None,
        "a string",
        [],
        42,
        {},
        {"paperId": "x"},  # no title
        {"title": "Untitled"},  # no paperId
        {"paperId": "", "title": "Empty ID"},
        {"paperId": "x", "title": "   "},  # whitespace-only title
    ],
    ids=[
        "none",
        "string",
        "list",
        "int",
        "empty-dict",
        "no-title",
        "no-id",
        "blank-id",
        "blank-title",
    ],
)
def test_normalize_rejects_unusable_records(bad):
    assert normalize_paper(bad) is None


def test_normalize_tolerates_missing_abstract():
    result = normalize_paper(make_raw_paper(abstract=None))
    assert result is not None
    assert result.abstract is None


def test_normalize_tolerates_missing_pdf():
    for missing in (None, {}, {"url": None}, {"url": ""}, "not-a-dict"):
        result = normalize_paper(make_raw_paper(openAccessPdf=missing))
        assert result is not None
        assert result.pdf_url is None


def test_normalize_tolerates_null_authors_and_fields():
    result = normalize_paper(make_raw_paper(authors=None, fieldsOfStudy=None))
    assert result is not None
    assert result.authors == []
    assert result.fields_of_study == []


def test_normalize_skips_junk_authors_but_keeps_good_ones():
    result = normalize_paper(
        make_raw_paper(
            authors=[
                {"authorId": "1", "name": "Ada Lovelace"},
                {"authorId": "2", "name": ""},  # blank name
                "not a dict",
                {"authorId": "3"},  # no name at all
                {"name": "Grace Hopper"},  # no ID is fine
            ]
        )
    )
    assert result is not None
    assert result.authors == [
        {"authorId": "1", "name": "Ada Lovelace"},
        {"authorId": None, "name": "Grace Hopper"},
    ]


def test_normalize_defaults_citation_count_to_zero():
    for bad in (None, "many", -1, True, {}):
        result = normalize_paper(make_raw_paper(citationCount=bad))
        assert result is not None
        assert result.citation_count == 0


def test_normalize_accepts_partial_publication_dates():
    assert normalize_paper(make_raw_paper(publicationDate="2020-03")).publication_date == date(
        2020, 3, 1
    )
    assert normalize_paper(make_raw_paper(publicationDate="2020")).publication_date == date(
        2020, 1, 1
    )
    assert normalize_paper(make_raw_paper(publicationDate="garbage")).publication_date is None


def test_normalize_backfills_year_from_publication_date():
    result = normalize_paper(make_raw_paper(year=None, publicationDate="2019-11-04"))
    assert result.year == 2019


def test_normalize_rejects_non_http_urls():
    """These URLs are handed to Linking.openURL — only http(s) may survive."""
    for dangerous in ("javascript:alert(1)", "file:///etc/passwd", "data:text/html,<b>x"):
        result = normalize_paper(make_raw_paper(url=dangerous, openAccessPdf={"url": dangerous}))
        assert result is not None
        assert result.paper_url is None
        assert result.pdf_url is None


def test_normalize_deduplicates_fields_of_study():
    result = normalize_paper(
        make_raw_paper(fieldsOfStudy=["Computer Science", "Computer Science", None, ""])
    )
    assert result.fields_of_study == ["Computer Science"]


def test_normalize_truncates_an_absurdly_long_title():
    result = normalize_paper(make_raw_paper(title="x" * 5000))
    assert len(result.title) == 2000


# --- search -------------------------------------------------------------


async def test_search_returns_normalized_papers():
    scholar = client_with(json_response({"data": [make_raw_paper()]}))
    papers = await scholar.search_papers("robotics")
    assert len(papers) == 1
    assert papers[0].id == "paper-001"


async def test_search_drops_malformed_records_but_keeps_the_rest():
    """One bad record must never sink the whole batch."""
    scholar = client_with(
        json_response(
            {
                "data": [
                    make_raw_paper(paperId="good-1"),
                    {"title": "no id"},
                    None,
                    "garbage",
                    make_raw_paper(paperId="good-2"),
                ]
            }
        )
    )
    papers = await scholar.search_papers("robotics")
    assert [p.id for p in papers] == ["good-1", "good-2"]


async def test_search_deduplicates_repeated_ids():
    scholar = client_with(
        json_response({"data": [make_raw_paper(), make_raw_paper(), make_raw_paper()]})
    )
    assert len(await scholar.search_papers("robotics")) == 1


@pytest.mark.parametrize(
    "payload",
    [{}, {"data": None}, {"data": "not a list"}, {"total": 0}],
    ids=["empty", "null-data", "data-not-a-list", "no-data-key"],
)
async def test_search_returns_empty_list_for_odd_payloads(payload):
    scholar = client_with(json_response(payload))
    assert await scholar.search_papers("robotics") == []


async def test_search_with_a_blank_query_makes_no_request():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"data": []})

    scholar = client_with(handler)
    assert await scholar.search_papers("   ") == []
    assert calls == []


async def test_search_requests_the_expected_fields():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"data": []})

    await client_with(handler).search_papers("robotics", limit=5)
    assert "query=robotics" in seen["url"]
    assert "openAccessPdf" in seen["url"]
    assert "limit=5" in seen["url"]


async def test_search_does_not_send_an_api_key_header_when_unset():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = request.headers
        return httpx.Response(200, json={"data": []})

    await client_with(handler).search_papers("robotics")
    assert "x-api-key" not in seen["headers"]


# --- failure handling ---------------------------------------------------


async def test_timeout_is_retried_then_surfaced():
    attempts = []

    def handler(request):
        attempts.append(1)
        raise httpx.ConnectTimeout("timed out")

    with pytest.raises(ExternalServiceError):
        await client_with(handler).search_papers("robotics")

    # Bounded: the initial attempt plus settings.semantic_scholar_max_retries.
    from app.core.config import settings

    assert len(attempts) == settings.semantic_scholar_max_retries + 1


async def test_a_transient_timeout_recovers_on_retry():
    attempts = []

    def handler(request):
        attempts.append(1)
        if len(attempts) == 1:
            raise httpx.ConnectTimeout("first attempt times out")
        return httpx.Response(200, json={"data": [make_raw_paper()]})

    papers = await client_with(handler).search_papers("robotics")
    assert len(papers) == 1
    assert len(attempts) == 2


async def test_rate_limit_is_not_retried():
    """Backing off inside a request would amplify the problem, not fix it."""
    attempts = []

    def handler(request):
        attempts.append(1)
        return httpx.Response(429, json={"message": "Too Many Requests"})

    with pytest.raises(RateLimitedError):
        await client_with(handler).search_papers("robotics")

    assert len(attempts) == 1


async def test_server_error_is_retried_then_surfaced():
    attempts = []

    def handler(request):
        attempts.append(1)
        return httpx.Response(503, json={"message": "unavailable"})

    with pytest.raises(ExternalServiceError):
        await client_with(handler).search_papers("robotics")
    assert len(attempts) > 1


async def test_client_error_is_not_retried():
    attempts = []

    def handler(request):
        attempts.append(1)
        return httpx.Response(400, json={"error": "bad request"})

    with pytest.raises(ExternalServiceError):
        await client_with(handler).search_papers("robotics")
    assert len(attempts) == 1


async def test_invalid_json_is_surfaced_as_a_service_error():
    def handler(request):
        return httpx.Response(200, content=b"<html>not json</html>")

    with pytest.raises(ExternalServiceError):
        await client_with(handler).search_papers("robotics")


async def test_external_service_error_message_is_user_safe():
    """The message reaches the app UI — it must not leak internals."""

    def handler(request):
        raise httpx.ConnectTimeout("connection to 10.0.0.5:5432 failed")

    with pytest.raises(ExternalServiceError) as exc_info:
        await client_with(handler).search_papers("robotics")

    assert "10.0.0.5" not in exc_info.value.message


# --- detail -------------------------------------------------------------


async def test_get_paper_returns_a_normalized_paper():
    scholar = client_with(json_response(make_raw_paper()))
    result = await scholar.get_paper("paper-001")
    assert result is not None
    assert result.title == "Attention Is All You Need"


async def test_get_paper_returns_none_for_an_unknown_id():
    def handler(request):
        return httpx.Response(404, json={"error": "Paper not found"})

    assert await client_with(handler).get_paper("does-not-exist") is None


async def test_get_paper_with_a_blank_id_makes_no_request():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={})

    assert await client_with(handler).get_paper("  ") is None
    assert calls == []
