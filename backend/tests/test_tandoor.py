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


class FakeResponse:
    def __init__(self, status_code=200, json_body=None, text=""):
        self.status_code = status_code
        self._json_body = json_body if json_body is not None else {}
        self.text = text or str(self._json_body)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(str(self.status_code), request=None, response=self)

    def json(self):
        return self._json_body


def _parsed_recipe():
    # Fresh dict per call - push_recipe's _fill_required_fields mutates its
    # argument in place, so a fixture shared by reference across tests
    # would leak state between them.
    return {
        "name": "Arroz con Gandules",
        "servings": None,
        "steps": [
            {
                "instruction": "Saute sofrito",
                "ingredients": [
                    {"food": {"name": "rice"}, "order": None},
                    {"food": {"name": "gandules"}, "order": None},
                ],
            }
        ],
        "internal": True,
    }


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


def test_push_recipe_parses_then_creates(monkeypatch):
    # recipe-from-source only parses/previews (confirmed against a live
    # Tandoor instance - see tandoor.py's module docstring); the recipe is
    # only actually saved by a second POST to /api/recipe/. This test
    # pins that two-call contract so a regression back to "one call and
    # assume success" gets caught here instead of silently in production.
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if url == "http://tandoor.local:8080/api/recipe-from-source/":
            return FakeResponse(200, {"recipe": _parsed_recipe()})
        if url == "http://tandoor.local:8080/api/recipe/":
            return FakeResponse(200, {"id": 42, "name": "Arroz con Gandules"})
        raise AssertionError(f"unexpected url {url}")

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is True
    assert len(calls) == 2

    parse_call, create_call = calls
    assert parse_call["headers"] == {"Authorization": "Bearer secret-token"}
    assert parse_call["json"]["url"] == "https://example.org/recipe"
    assert "Arroz con Gandules" in parse_call["json"]["data"]
    assert "2 cups rice" in parse_call["json"]["data"]
    assert "recipeIngredient" in parse_call["json"]["data"]

    assert create_call["headers"] == {"Authorization": "Bearer secret-token"}
    assert create_call["json"]["name"] == "Arroz con Gandules"


def test_push_recipe_fills_required_null_fields_before_creating(monkeypatch):
    # /api/recipe/'s real serializer rejects a null "servings" and a null
    # per-ingredient "order" ("This field may not be null" - confirmed
    # against a live instance), even though the parse step always returns
    # them null. Without this fill-in, every push would 400 on the create
    # call and silently fail.
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    captured_create_json = {}

    def fake_post(url, json, headers, timeout):
        if url == "http://tandoor.local:8080/api/recipe-from-source/":
            return FakeResponse(200, {"recipe": _parsed_recipe()})
        captured_create_json.update(json)
        return FakeResponse(200, {"id": 42})

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is True
    assert captured_create_json["servings"] == 1
    orders = [ing["order"] for ing in captured_create_json["steps"][0]["ingredients"]]
    assert orders == [0, 1]


def test_push_recipe_returns_false_when_parse_returns_no_recipe(monkeypatch):
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    calls = {"n": 0}

    def fake_post(url, json, headers, timeout):
        calls["n"] += 1
        return FakeResponse(200, {"error": True, "msg": "No usable data could be found."})

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is False
    # never attempts the create call without a parsed recipe to send
    assert calls["n"] == 1


def test_push_recipe_returns_false_when_create_call_fails(monkeypatch):
    import app.tandoor as tandoor

    monkeypatch.setenv("TANDOOR_URL", "http://tandoor.local:8080")
    monkeypatch.setenv("TANDOOR_API_TOKEN", "secret-token")

    def fake_post(url, json, headers, timeout):
        if url == "http://tandoor.local:8080/api/recipe-from-source/":
            return FakeResponse(200, {"recipe": _parsed_recipe()})
        return FakeResponse(400, {"detail": "Bad Request"})

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    # the parse call succeeding must not be mistaken for the recipe existing
    assert push_recipe(_recipe_item()) is False


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

    def fake_post(*args, **kwargs):
        return FakeResponse(403, text="Forbidden")

    monkeypatch.setattr(tandoor.httpx, "post", fake_post)

    assert push_recipe(_recipe_item()) is False
