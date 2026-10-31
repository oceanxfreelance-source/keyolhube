async def test_live(client):
    r = await client.get("/api/v1/health/live")
    assert r.status_code == 200


async def test_ready_reports_postgis_and_redis(client):
    r = await client.get("/api/v1/health/ready")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["checks"]["postgis"]["version"].startswith("3.")
    assert body["checks"]["redis"]["status"] == "ok"


async def test_openapi_documents_routes(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    for p in [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/map/style.json",
        "/api/v1/health/ready",
    ]:
        assert p in paths
