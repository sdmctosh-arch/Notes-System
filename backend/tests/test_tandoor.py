import httpx

from app.models import Enrichment, QueueItem
from app.tandoor import push_recipe


def _recipe_item(**overrides):
    base = dict(
        queue_id="a",
        capture_id="a",
        category="recipe",
        title="Arroz con Gandules",
        body="Full recipe text.",
        url="https://example.org/recipe",
        captured="2026-08-11T13:30:10-04:00",
        created="2026-08-11T13:30:10-04:00",
        status="enriched",
        enrichment=Enrichment(
            kind="recipe",
            summary="",
            detail="",
            citations=[],
            structured={
                "name": "Arroz con Gandules",
                "recipeIngredient": ["2 cups rice", "1 can gandules"],
                "recipeInstructions": ["Saute sofrito", "Add rice and beans"],
            },
            model="gemini-3.5-flash",
            enriched_at="2026-08-18T17:02:11-04:00",
        ),
        processor_version="0.2",
    )
    base.update(overrides)
    return QueueItem(**base)


def test_push_recipe_skips_when_not_configured(monkeypatch):
    import app.tandoor as tandoor

    # ensure a clean slate regardless of the real environment
    monkeypatch.delenv("TANDOOR_URL", raising=False)
    monkeypatch.delenv("TANDOOR_API_TOKEN", raising=False)

    called = {"n": 0}

    def fake_post(*args, **kwargs):
        called["n"] += 1
        raise AssertionError("httpx.post should not be called when Tandoor isn't configured")

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is False
    assert called["n"] == 0


def test_push_recipe_sends_schema_org_json_ld_and_auth_header(monkeypatch):
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    captured = {}

    class FakeResponse:
        text = "ok"

        def raise_for_status(self):
            pass

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is True
    assert captured["url"] == "http://tandoor.local:8080/api/recipe-from-source/"
    assert captured["headers"] == {"Authorization": "Bearer secret-token"}
    assert captured["json"]["url"] == "https://example.org/recipe"
    assert "Arroz con Gandules" in captured["json"]["data"]
    assert "2 cups rice" in captured["json"]["data"]
    assert "recipeIngredient" in captured["json"]["data"]


def test_push_recipe_swallows_network_errors(monkeypatch):
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    # must not raise - a Tandoor outage can never block "Keep in vault"
    assert push_recipe(_recipe_item()) is False


def test_push_recipe_swallows_http_error_status(monkeypatch):
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "wrong-token")

    class FakeResponse:
        text = "Forbidden"

        def raise_for_status(self):
            raise httpx.HTTPStatusError("403", request=None, response=None)

    monkeypatch.setattr(tandoor.httpx, "post", lambda *a, **k: FakeResponse())

    assert push_recipe(_recipe_item()) is False
