"""Health endpoint, error envelope, and OpenAPI surface."""

from httpx import AsyncClient


async def test_health_reports_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


async def test_unknown_route_uses_the_shared_error_envelope(client: AsyncClient):
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_openapi_schema_is_served(client: AsyncClient):
    response = await client.get("/openapi.json")
    assert response.status_code == 200

    paths = response.json()["paths"]
    for required in [
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/interests",
        "/api/v1/users/me/interests",
        "/api/v1/papers/feed",
        "/api/v1/papers/saved",
        "/api/v1/papers/{paper_id}",
        "/api/v1/swipes",
        "/api/v1/swipes/{paper_id}",
        "/health",
    ]:
        assert required in paths, f"{required} missing from the OpenAPI schema"


async def test_openapi_schema_never_mentions_password_hashes(client: AsyncClient):
    schema = (await client.get("/openapi.json")).text
    assert "password_hash" not in schema
