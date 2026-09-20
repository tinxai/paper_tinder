"""Suggested interest catalogue and per-user interest management."""

from httpx import AsyncClient


async def test_seeding_is_idempotent(db, seeded_interests):
    from app.services.interests import SUGGESTED_INTERESTS, seed_suggested_interests

    assert seeded_interests == len(SUGGESTED_INTERESTS)
    # Running it again creates nothing new.
    assert await seed_suggested_interests(db) == 0


async def test_list_interests_returns_suggestions(client: AsyncClient, seeded_interests):
    response = await client.get("/api/v1/interests")
    assert response.status_code == 200

    names = [i["name"] for i in response.json()["items"]]
    assert "Human-Computer Interaction" in names
    assert "Vision-Language Models" in names
    assert len(names) == seeded_interests


async def test_user_interests_start_empty(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/users/me/interests")
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_set_interests_accepts_suggested_and_custom(
    auth_client: AsyncClient, seeded_interests
):
    response = await auth_client.put(
        "/api/v1/users/me/interests",
        json={"names": ["Computer Vision", "Neurosymbolic Program Synthesis"]},
    )
    assert response.status_code == 200

    items = response.json()["items"]
    by_name = {i["name"]: i for i in items}
    assert by_name["Computer Vision"]["is_suggested"] is True
    # A custom interest is created on the fly and flagged as not suggested.
    assert by_name["Neurosymbolic Program Synthesis"]["is_suggested"] is False


async def test_set_interests_is_a_full_replacement(auth_client: AsyncClient):
    await auth_client.put(
        "/api/v1/users/me/interests", json={"names": ["Robotics", "Computer Vision"]}
    )
    await auth_client.put("/api/v1/users/me/interests", json={"names": ["Robotics"]})

    response = await auth_client.get("/api/v1/users/me/interests")
    assert [i["name"] for i in response.json()["items"]] == ["Robotics"]


async def test_set_interests_deduplicates_case_and_whitespace(auth_client: AsyncClient):
    response = await auth_client.put(
        "/api/v1/users/me/interests",
        json={"names": ["Robotics", "  robotics ", "ROBOTICS"]},
    )
    assert len(response.json()["items"]) == 1


async def test_interests_are_shared_but_assignments_are_per_user(client: AsyncClient, db):
    from tests.conftest import auth_headers, register_user

    first = await register_user(client, email="a@example.com")
    await client.put(
        "/api/v1/users/me/interests",
        json={"names": ["Swarm Robotics"]},
        headers=auth_headers(first["access_token"]),
    )

    second = await register_user(client, email="b@example.com")
    response = await client.get(
        "/api/v1/users/me/interests", headers=auth_headers(second["access_token"])
    )
    assert response.json()["items"] == []

    # The interest row itself is reused, not duplicated.
    catalogue = await client.get("/api/v1/interests")
    swarm = [i for i in catalogue.json()["items"] if i["name"] == "Swarm Robotics"]
    assert len(swarm) == 1


async def test_set_interests_rejects_empty_list(auth_client: AsyncClient):
    response = await auth_client.put("/api/v1/users/me/interests", json={"names": []})
    assert response.status_code == 422


async def test_set_interests_rejects_blank_names(auth_client: AsyncClient):
    response = await auth_client.put("/api/v1/users/me/interests", json={"names": ["   ", ""]})
    assert response.status_code == 422


async def test_interests_endpoints_require_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/users/me/interests")).status_code == 401
    assert (
        await client.put("/api/v1/users/me/interests", json={"names": ["Robotics"]})
    ).status_code == 401


async def test_onboarding_flag_flips_after_choosing_interests(auth_client: AsyncClient):
    before = (await auth_client.get("/api/v1/auth/me")).json()
    assert before["has_completed_onboarding"] is False

    await auth_client.put("/api/v1/users/me/interests", json={"names": ["Robotics"]})

    after = (await auth_client.get("/api/v1/auth/me")).json()
    assert after["has_completed_onboarding"] is True
