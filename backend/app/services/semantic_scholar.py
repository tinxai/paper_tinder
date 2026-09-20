"""Semantic Scholar Academic Graph API client.

Only the documented JSON API is used — nothing here scrapes HTML.

Design notes:
  * Every request has an explicit total timeout (no unbounded hangs).
  * Retries are bounded and only cover *transient* failures (timeouts, 5xx).
    A 429 is NOT retried in-request: backing off inside a user's request would
    just hold the connection open and amplify the rate-limit problem. We surface
    it and let the client retry.
  * Every record is normalized defensively. The upstream regularly returns
    partial records (no abstract, no year, null authors), and a single bad
    record must never fail the whole batch.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import ExternalServiceError

logger = logging.getLogger(__name__)

# Exactly the fields the app renders — asking for less keeps responses small.
PAPER_FIELDS = ",".join(
    [
        "paperId",
        "title",
        "abstract",
        "authors",
        "year",
        "publicationDate",
        "venue",
        "citationCount",
        "url",
        "openAccessPdf",
        "fieldsOfStudy",
    ]
)

MAX_TITLE_LEN = 2000


class RateLimitedError(ExternalServiceError):
    code = "upstream_rate_limited"
    message = "Paper search is busy right now. Please try again in a moment."


@dataclass(slots=True)
class NormalizedPaper:
    """Upstream record reduced to exactly what we persist."""

    id: str
    title: str
    abstract: str | None = None
    year: int | None = None
    publication_date: date | None = None
    venue: str | None = None
    citation_count: int = 0
    paper_url: str | None = None
    pdf_url: str | None = None
    authors: list[dict[str, Any]] = field(default_factory=list)
    fields_of_study: list[str] = field(default_factory=list)

    def to_row(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "abstract": self.abstract,
            "year": self.year,
            "publication_date": self.publication_date,
            "venue": self.venue,
            "citation_count": self.citation_count,
            "paper_url": self.paper_url,
            "pdf_url": self.pdf_url,
            "authors": self.authors,
            "fields_of_study": self.fields_of_study,
        }


def _clean_str(value: Any, max_len: int | None = None) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if max_len is not None and len(cleaned) > max_len:
        cleaned = cleaned[:max_len]
    return cleaned


def _clean_int(value: Any, minimum: int = 0) -> int | None:
    if isinstance(value, bool):  # bool is an int subclass — reject it explicitly
        return None
    if isinstance(value, int):
        return value if value >= minimum else None
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= minimum else None
    return None


def _clean_url(value: Any) -> str | None:
    """Only http(s) URLs survive — the app hands these to Linking.openURL."""
    url = _clean_str(value, 2048)
    if url is None:
        return None
    lowered = url.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return url
    return None


def _parse_publication_date(value: Any) -> date | None:
    raw = _clean_str(value)
    if raw is None:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def normalize_paper(raw: Any) -> NormalizedPaper | None:
    """Convert one upstream record into a NormalizedPaper.

    Returns None when the record is unusable (no ID or no title) — those are the
    only two fields we genuinely cannot render a card without.
    """
    if not isinstance(raw, dict):
        return None

    paper_id = _clean_str(raw.get("paperId"), 64)
    title = _clean_str(raw.get("title"), MAX_TITLE_LEN)
    if not paper_id or not title:
        return None

    authors: list[dict[str, Any]] = []
    for author in raw.get("authors") or []:
        if not isinstance(author, dict):
            continue
        name = _clean_str(author.get("name"), 255)
        if not name:
            continue
        authors.append({"authorId": _clean_str(author.get("authorId"), 64), "name": name})

    fields_of_study: list[str] = []
    for fos in raw.get("fieldsOfStudy") or []:
        cleaned = _clean_str(fos, 120)
        if cleaned and cleaned not in fields_of_study:
            fields_of_study.append(cleaned)

    open_access = raw.get("openAccessPdf")
    pdf_url = _clean_url(open_access.get("url")) if isinstance(open_access, dict) else None

    publication_date = _parse_publication_date(raw.get("publicationDate"))
    year = _clean_int(raw.get("year"), minimum=1400)
    if year is None and publication_date is not None:
        year = publication_date.year

    return NormalizedPaper(
        id=paper_id,
        title=title,
        abstract=_clean_str(raw.get("abstract")),
        year=year,
        publication_date=publication_date,
        venue=_clean_str(raw.get("venue"), 500),
        citation_count=_clean_int(raw.get("citationCount")) or 0,
        paper_url=_clean_url(raw.get("url")),
        pdf_url=pdf_url,
        authors=authors,
        fields_of_study=fields_of_study,
    )


class SemanticScholarClient:
    """Thin async wrapper over the Academic Graph REST API."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._external_client = client
        self._base_url = settings.semantic_scholar_base_url.rstrip("/")
        self._timeout = settings.semantic_scholar_timeout_seconds
        self._max_retries = max(0, settings.semantic_scholar_max_retries)

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", "User-Agent": "PaperSwipe/0.1"}
        # Optional; the public endpoint works without one. Never hardcoded.
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key
        return headers

    async def _request(self, path: str, params: dict[str, Any]) -> dict[str, Any] | None:
        """GET `path`. Returns parsed JSON, or None for an upstream 404.

        Raises ExternalServiceError / RateLimitedError for failures worth surfacing.
        """
        url = f"{self._base_url}{path}"
        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                if self._external_client is not None:
                    response = await self._external_client.get(
                        url, params=params, headers=self._headers(), timeout=self._timeout
                    )
                else:
                    async with httpx.AsyncClient(timeout=self._timeout) as client:
                        response = await client.get(url, params=params, headers=self._headers())
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                logger.warning(
                    "Semantic Scholar request failed (attempt %s/%s): %s",
                    attempt + 1,
                    self._max_retries + 1,
                    exc,
                )
                if attempt < self._max_retries:
                    # Short bounded backoff: 0.5s, 1.0s. Never an unbounded storm.
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                raise ExternalServiceError(
                    "Could not reach the paper search service. Please try again."
                ) from exc

            if response.status_code == 429:
                # Do not retry in-request; surface it so the caller can back off.
                logger.warning("Semantic Scholar rate limited request to %s", path)
                raise RateLimitedError()

            if response.status_code == 404:
                return None

            if response.status_code >= 500:
                last_error = httpx.HTTPStatusError(
                    f"upstream {response.status_code}", request=response.request, response=response
                )
                if attempt < self._max_retries:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                raise ExternalServiceError() from last_error

            if response.status_code >= 400:
                logger.warning(
                    "Semantic Scholar rejected request to %s: %s %s",
                    path,
                    response.status_code,
                    response.text[:200],
                )
                raise ExternalServiceError("Paper search rejected the request.")

            try:
                payload = response.json()
            except ValueError as exc:
                raise ExternalServiceError("Paper search returned an invalid response.") from exc

            if not isinstance(payload, dict):
                raise ExternalServiceError("Paper search returned an unexpected response.")
            return payload

        raise ExternalServiceError() from last_error

    async def search_papers(
        self, query: str, limit: int = 20, offset: int = 0
    ) -> list[NormalizedPaper]:
        """Relevance search. Returns [] rather than raising on an empty/odd payload."""
        query = query.strip()
        if not query:
            return []

        payload = await self._request(
            "/paper/search",
            {
                "query": query,
                "limit": max(1, min(limit, 100)),
                "offset": max(0, offset),
                "fields": PAPER_FIELDS,
            },
        )
        if payload is None:
            return []

        raw_items = payload.get("data")
        if not isinstance(raw_items, list):
            logger.warning("Semantic Scholar search for %r returned no `data` list", query)
            return []

        papers: list[NormalizedPaper] = []
        seen: set[str] = set()
        for raw in raw_items:
            normalized = normalize_paper(raw)
            if normalized is None:
                continue
            if normalized.id in seen:  # upstream occasionally repeats a record
                continue
            seen.add(normalized.id)
            papers.append(normalized)
        return papers

    async def get_paper(self, paper_id: str) -> NormalizedPaper | None:
        paper_id = paper_id.strip()
        if not paper_id:
            return None
        payload = await self._request(f"/paper/{paper_id}", {"fields": PAPER_FIELDS})
        if payload is None:
            return None
        return normalize_paper(payload)


def get_semantic_scholar_client() -> SemanticScholarClient:
    """FastAPI dependency. Overridden in tests with a mocked transport."""
    return SemanticScholarClient()
