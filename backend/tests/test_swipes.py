"""Swipe recording, saved papers, and swipe removal."""

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Paper, Swipe
from tests.conftest import make_raw_paper


async def seed_feed(auth_client: AsyncClient, scholar, papers: list[dict]) -> None:
    """Populate the paper cache by pulling a feed, the way the app does."""
    scholar.raw_search_results = papers
    await auth_client.put("/api/v1/users/me/interests", json={"names": ["Robotics"]})
    response = await auth_client.get("/api/v1/papers/feed")
    assert response.status_code == 200


# --- creating swipes ----------------------------------------------------


async def test_swipe_right_is_recorded(auth_client: AsyncClient, scholar, db):
    await seed_feed(auth_client, scholar, [make_raw_paper()])

    response = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"}
    )
    assert response.status_code == 201

    body = response.json()
    assert body["paper_id"] == "paper-001"
    assert body["direction"] == "right"

    stored = await db.scalar(select(Swipe).where(Swipe.paper_id == "paper-001"))
    assert stored is not None


async def test_swipe_left_is_recorded(auth_client: AsyncClient, scholar):
    await seed_feed(auth_client, scholar, [make_raw_paper()])

    response = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "left"}
    )
    assert response.status_code == 201
    assert response.json()["direction"] == "left"


async def test_swipe_rejects_an_invalid_direction(auth_client: AsyncClient, scholar):
    await seed_feed(auth_client, scholar, [make_raw_paper()])
    response = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "up"}
    )
    assert response.status_code == 422


async def test_swipe_on_an_uncached_paper_fetches_it_from_upstream(
    auth_client: AsyncClient, scholar, db
):
    """Covers deep links and a cache the app has outlived."""
    scholar.raw_detail_result = make_raw_paper(paperId="deep-link-paper")

    response = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "deep-link-paper", "direction": "right"}
    )
    assert response.status_code == 201
    assert scholar.detail_calls == ["deep-link-paper"]
    assert await db.get(Paper, "deep-link-paper") is not None


async def test_swipe_on_a_nonexistent_paper_is_a_404(auth_client: AsyncClient, scholar):
    scholar.raw_search_results = []
    response = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "no-such-paper", "direction": "right"}
    )
    assert response.status_code == 404


async def test_swipe_requires_authentication(client: AsyncClient):
    response = await client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"}
    )
    assert response.status_code == 401


# --- duplicate swipes ---------------------------------------------------


async def test_duplicate_swipe_updates_instead_of_failing(auth_client: AsyncClient, scholar, db):
    """A client retry after a dropped response must be safe, not a 409."""
    await seed_feed(auth_client, scholar, [make_raw_paper()])

    first = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "left"}
    )
    second = await auth_client.post(
        "/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"}
    )

    assert first.status_code == second.status_code == 201
    # Same row, updated direction — not a second row.
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["direction"] == "right"

    rows = (await db.execute(select(Swipe).where(Swipe.paper_id == "paper-001"))).all()
    assert len(rows) == 1


async def test_changing_a_swipe_from_left_to_right_adds_it_to_saved(
    auth_client: AsyncClient, scholar
):
    await seed_feed(auth_client, scholar, [make_raw_paper()])

    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "left"})
    assert (await auth_client.get("/api/v1/papers/saved")).json()["items"] == []

    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"})
    saved = (await auth_client.get("/api/v1/papers/saved")).json()
    assert [p["id"] for p in saved["items"]] == ["paper-001"]


async def test_two_users_can_swipe_the_same_paper(client: AsyncClient, scholar):
    from tests.conftest import auth_headers, register_user

    scholar.raw_detail_result = make_raw_paper()

    for email in ("one@example.com", "two@example.com"):
        data = await register_user(client, email=email)
        response = await client.post(
            "/api/v1/swipes",
            json={"paper_id": "paper-001", "direction": "right"},
            headers=auth_headers(data["access_token"]),
        )
        assert response.status_code == 201


# --- saved papers -------------------------------------------------------


async def test_saved_returns_only_right_swipes(auth_client: AsyncClient, scholar):
    await seed_feed(
        auth_client,
        scholar,
        [make_raw_paper(paperId="kept"), make_raw_paper(paperId="dropped")],
    )

    await auth_client.post("/api/v1/swipes", json={"paper_id": "kept", "direction": "right"})
    await auth_client.post("/api/v1/swipes", json={"paper_id": "dropped", "direction": "left"})

    saved = (await auth_client.get("/api/v1/papers/saved")).json()
    assert [p["id"] for p in saved["items"]] == ["kept"]
    assert saved["total"] == 1


async def test_saved_is_empty_for_a_new_user(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/papers/saved")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["has_more"] is False


async def test_saved_includes_full_paper_metadata(auth_client: AsyncClient, scholar):
    await seed_feed(auth_client, scholar, [make_raw_paper()])
    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"})

    paper = (await auth_client.get("/api/v1/papers/saved")).json()["items"][0]
    assert paper["title"] == "Attention Is All You Need"
    assert paper["authors"][0]["name"] == "Ashish Vaswani"
    assert paper["pdf_url"]
    assert paper["saved_at"]


async def test_saved_search_matches_title_and_author(auth_client: AsyncClient, scholar):
    await seed_feed(
        auth_client,
        scholar,
        [
            make_raw_paper(
                paperId="p1", title="Robotic Grasping", authors=[{"name": "Ada Lovelace"}]
            ),
            make_raw_paper(
                paperId="p2", title="Language Models", authors=[{"name": "Grace Hopper"}]
            ),
        ],
    )
    for pid in ("p1", "p2"):
        await auth_client.post("/api/v1/swipes", json={"paper_id": pid, "direction": "right"})

    by_title = await auth_client.get("/api/v1/papers/saved", params={"q": "grasping"})
    assert [p["id"] for p in by_title.json()["items"]] == ["p1"]

    by_author = await auth_client.get("/api/v1/papers/saved", params={"q": "Hopper"})
    assert [p["id"] for p in by_author.json()["items"]] == ["p2"]

    no_match = await auth_client.get("/api/v1/papers/saved", params={"q": "zzzznothing"})
    assert no_match.json()["items"] == []


async def test_saved_filters_by_year(auth_client: AsyncClient, scholar):
    await seed_feed(
        auth_client,
        scholar,
        [
            make_raw_paper(paperId="old", year=2015, publicationDate="2015-01-01"),
            make_raw_paper(paperId="new", year=2024, publicationDate="2024-01-01"),
        ],
    )
    for pid in ("old", "new"):
        await auth_client.post("/api/v1/swipes", json={"paper_id": pid, "direction": "right"})

    response = await auth_client.get("/api/v1/papers/saved", params={"year": 2024})
    assert [p["id"] for p in response.json()["items"]] == ["new"]


async def test_saved_sorts_by_citation_count(auth_client: AsyncClient, scholar):
    await seed_feed(
        auth_client,
        scholar,
        [
            make_raw_paper(paperId="few", citationCount=5),
            make_raw_paper(paperId="many", citationCount=9000),
        ],
    )
    for pid in ("few", "many"):
        await auth_client.post("/api/v1/swipes", json={"paper_id": pid, "direction": "right"})

    response = await auth_client.get("/api/v1/papers/saved", params={"sort": "citations"})
    assert [p["id"] for p in response.json()["items"]] == ["many", "few"]


async def test_saved_sorts_newest_and_oldest_by_save_time(auth_client: AsyncClient, scholar):
    await seed_feed(
        auth_client,
        scholar,
        [make_raw_paper(paperId="first"), make_raw_paper(paperId="second")],
    )
    await auth_client.post("/api/v1/swipes", json={"paper_id": "first", "direction": "right"})
    await auth_client.post("/api/v1/swipes", json={"paper_id": "second", "direction": "right"})

    newest = await auth_client.get("/api/v1/papers/saved", params={"sort": "newest"})
    oldest = await auth_client.get("/api/v1/papers/saved", params={"sort": "oldest"})

    assert [p["id"] for p in newest.json()["items"]] == ["second", "first"]
    assert [p["id"] for p in oldest.json()["items"]] == ["first", "second"]


async def test_saved_paginates(auth_client: AsyncClient, scholar):
    papers = [make_raw_paper(paperId=f"p{i}") for i in range(5)]
    await seed_feed(auth_client, scholar, papers)
    for i in range(5):
        await auth_client.post("/api/v1/swipes", json={"paper_id": f"p{i}", "direction": "right"})

    first = (await auth_client.get("/api/v1/papers/saved", params={"limit": 2})).json()
    assert len(first["items"]) == 2
    assert first["total"] == 5
    assert first["has_more"] is True

    last = (await auth_client.get("/api/v1/papers/saved", params={"limit": 2, "offset": 4})).json()
    assert len(last["items"]) == 1
    assert last["has_more"] is False


async def test_saved_is_scoped_to_the_signed_in_user(client: AsyncClient, scholar):
    from tests.conftest import auth_headers, register_user

    scholar.raw_detail_result = make_raw_paper()

    owner = await register_user(client, email="owner@example.com")
    await client.post(
        "/api/v1/swipes",
        json={"paper_id": "paper-001", "direction": "right"},
        headers=auth_headers(owner["access_token"]),
    )

    other = await register_user(client, email="other@example.com")
    response = await client.get("/api/v1/papers/saved", headers=auth_headers(other["access_token"]))
    assert response.json()["items"] == []


async def test_saved_requires_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/papers/saved")).status_code == 401


# --- removing swipes ----------------------------------------------------


async def test_delete_swipe_removes_it_from_saved(auth_client: AsyncClient, scholar):
    await seed_feed(auth_client, scholar, [make_raw_paper()])
    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"})

    response = await auth_client.delete("/api/v1/swipes/paper-001")
    assert response.status_code == 204

    assert (await auth_client.get("/api/v1/papers/saved")).json()["items"] == []


async def test_delete_an_unswiped_paper_is_a_404(auth_client: AsyncClient):
    assert (await auth_client.delete("/api/v1/swipes/never-swiped")).status_code == 404


async def test_delete_swipe_makes_the_paper_eligible_for_the_feed_again(
    auth_client: AsyncClient, scholar
):
    await seed_feed(auth_client, scholar, [make_raw_paper()])
    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "left"})
    assert (await auth_client.get("/api/v1/papers/feed")).json()["items"] == []

    await auth_client.delete("/api/v1/swipes/paper-001")

    feed = (await auth_client.get("/api/v1/papers/feed")).json()
    assert [p["id"] for p in feed["items"]] == ["paper-001"]


async def test_delete_swipe_requires_authentication(client: AsyncClient):
    assert (await client.delete("/api/v1/swipes/paper-001")).status_code == 401
