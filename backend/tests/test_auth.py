from tests.conftest import unique_email

PASSWORD = "correct-horse-battery"


async def _register_and_login(client, email):
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


async def test_register_login_me(client):
    email = unique_email()
    tokens = await _register_and_login(client, email)
    r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == email and me["role"] == "captain"
    assert "password_hash" not in me


async def test_email_is_case_insensitive_and_unique(client):
    email = unique_email()
    await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    r = await client.post("/api/v1/auth/register", json={"email": email.upper(), "password": PASSWORD})
    assert r.status_code == 409


async def test_weak_password_rejected(client):
    r = await client.post("/api/v1/auth/register", json={"email": unique_email(), "password": "short"})
    assert r.status_code == 422


async def test_wrong_password_and_unknown_user(client):
    email = unique_email()
    await _register_and_login(client, email)
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-x"})
    assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": unique_email(), "password": PASSWORD})
    assert r.status_code == 401


async def test_me_requires_valid_token(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


async def test_refresh_rotates_and_detects_reuse(client):
    tokens = await _register_and_login(client, unique_email())
    old = tokens["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert r.status_code == 200
    new = r.json()["refresh_token"]
    assert new != old

    # Re-using the rotated token is treated as theft: it fails and revokes the whole family.
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": old})).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": new})).status_code == 401


async def test_logout_revokes_refresh_token(client):
    tokens = await _register_and_login(client, unique_email())
    r = await client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


async def test_login_rate_limited(client):
    body = {"email": unique_email(), "password": "wrong-password-x"}
    codes = [(await client.post("/api/v1/auth/login", json=body)).status_code for _ in range(21)]
    assert codes[:20] == [401] * 20
    assert codes[20] == 429
