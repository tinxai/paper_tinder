"""Registration, login, session, and account deletion."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Swipe, User, UserInterest
from tests.conftest import auth_headers, register_user


async def test_register_creates_user_and_returns_token(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "sup3rsecret!"},
    )
    assert response.status_code == 201
    body = response.json()

    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["expires_in"] > 0
    assert body["user"]["email"] == "new@example.com"
    assert body["user"]["has_completed_onboarding"] is False


async def test_register_never_exposes_password_hash(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "leak@example.com", "password": "sup3rsecret!"},
    )
    raw = response.text.lower()
    assert "password_hash" not in raw
    assert "sup3rsecret" not in raw
    assert "$argon2" not in raw


async def test_register_normalizes_email_case(client: AsyncClient, db):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "MixedCase@Example.COM", "password": "sup3rsecret!"},
    )
    stored = await db.scalar(select(User).where(User.email == "mixedcase@example.com"))
    assert stored is not None


async def test_register_rejects_duplicate_email(client: AsyncClient):
    await register_user(client, email="dupe@example.com")
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "dupe@example.com", "password": "anotherpassword"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_register_rejects_duplicate_email_case_insensitively(client: AsyncClient):
    await register_user(client, email="dupe@example.com")
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "DUPE@example.com", "password": "anotherpassword"},
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        ({"email": "not-an-email", "password": "sup3rsecret!"}, "bad email"),
        ({"email": "short@example.com", "password": "short"}, "password < 8 chars"),
        ({"email": "missing@example.com"}, "no password"),
    ],
)
async def test_register_validation_errors(client: AsyncClient, payload, reason):
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422, reason
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "fields" in body["error"]["details"]


async def test_login_success(client: AsyncClient):
    await register_user(client, email="login@example.com", password="sup3rsecret!")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "sup3rsecret!"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_login_wrong_password_fails(client: AsyncClient):
    await register_user(client, email="login@example.com", password="sup3rsecret!")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


async def test_login_failure_message_does_not_reveal_whether_account_exists(
    client: AsyncClient,
):
    await register_user(client, email="known@example.com", password="sup3rsecret!")

    wrong_password = await client.post(
        "/api/v1/auth/login",
        json={"email": "known@example.com", "password": "wrongpassword"},
    )
    unknown_email = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrongpassword"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    # Identical response bodies — no account enumeration.
    assert wrong_password.json() == unknown_email.json()


async def test_me_requires_authentication(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_me_rejects_garbage_token(client: AsyncClient):
    response = await client.get("/api/v1/auth/me", headers=auth_headers("not.a.jwt"))
    assert response.status_code == 401


async def test_me_returns_current_user(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "researcher@example.com"


async def test_token_survives_a_new_client_instance(client: AsyncClient):
    """The token is stateless — what makes 'stay signed in' work in the app."""
    data = await register_user(client, email="persist@example.com")
    client.headers.clear()

    response = await client.get("/api/v1/auth/me", headers=auth_headers(data["access_token"]))
    assert response.status_code == 200


async def test_delete_account_removes_user_and_related_rows(
    auth_client: AsyncClient, db, scholar, raw_paper_factory
):
    scholar.raw_search_results = [raw_paper_factory()]

    await auth_client.put("/api/v1/users/me/interests", json={"names": ["Robotics"]})
    await auth_client.post("/api/v1/swipes", json={"paper_id": "paper-001", "direction": "right"})

    me = (await auth_client.get("/api/v1/auth/me")).json()
    user_id = me["id"]

    response = await auth_client.delete("/api/v1/auth/me")
    assert response.status_code == 204

    assert await db.get(User, user_id) is None
    remaining_swipes = (await db.execute(select(Swipe).where(Swipe.user_id == user_id))).all()
    remaining_interests = (
        await db.execute(select(UserInterest).where(UserInterest.user_id == user_id))
    ).all()
    assert remaining_swipes == []
    assert remaining_interests == []

    # The token is now useless even though it has not expired.
    assert (await auth_client.get("/api/v1/auth/me")).status_code == 401


async def test_delete_account_requires_authentication(client: AsyncClient):
    assert (await client.delete("/api/v1/auth/me")).status_code == 401
