def test_items_requires_auth(sandbox):
    resp = sandbox.raw_client.get("/api/items")
    assert resp.status_code == 401


def test_login_wrong_password_is_401(sandbox):
    resp = sandbox.raw_client.post("/api/login", json={"password": "not-it"})
    assert resp.status_code == 401
    # and no cookie should have been set
    assert sandbox.raw_client.get("/api/items").status_code == 401


def test_login_correct_password_grants_access(sandbox):
    resp = sandbox.raw_client.post("/api/login", json={"password": sandbox.password})
    assert resp.status_code == 200
    assert "notes_session" in resp.cookies

    resp = sandbox.raw_client.get("/api/items")
    assert resp.status_code == 200


def test_logout_revokes_access(sandbox):
    # sandbox.client is already logged in by the fixture.
    assert sandbox.client.get("/api/items").status_code == 200
    sandbox.client.post("/api/logout")
    assert sandbox.client.get("/api/items").status_code == 401


def test_move_and_patch_also_require_auth(sandbox):
    sandbox.seed(queue_id="a")
    assert sandbox.raw_client.patch("/api/items/a", json={"title": "x"}).status_code == 401
    assert sandbox.raw_client.post("/api/items/a/move", json={"action": "archive"}).status_code == 401
