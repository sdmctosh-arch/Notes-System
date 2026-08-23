import json

import pytest

from app import storage

# Not "from app.storage import ItemNotFoundError" - the sandbox fixture
# reloads app.storage per-test (to pick up its monkeypatched directories),
# which rebinds ItemNotFoundError to a new class object each time. A
# top-level import captured before that reload would be a stale class that
# `pytest.raises` (an isinstance check) would never match against what the
# reloaded module actually raises. Referencing storage.ItemNotFoundError
# resolves it fresh at call time instead.


@pytest.mark.parametrize(
    "bad_id",
    ["../x", "..\\x", "a/b", "a\\b", "..", ".", "", "%2e%2e", "a/../../b"],
)
def test_validate_queue_id_rejects_path_traversal_and_separators(bad_id):
    with pytest.raises(storage.ItemNotFoundError):
        storage._validate_queue_id(bad_id)


@pytest.mark.parametrize(
    "good_id",
    ["2026-08-11-13-30-10-pm-02", "manual-20260822-134501-a1b2c3", "a", "A.b_c-9"],
)
def test_validate_queue_id_accepts_real_id_shapes(good_id):
    storage._validate_queue_id(good_id)  # doesn't raise


def _plant_victim(sandbox) -> dict:
    # Outside queue_dir entirely (a sibling of queue_dir itself, two levels
    # above QUEUE_PENDING_DIR/QUEUE_ARCHIVED_DIR - "../../victim" is what
    # actually reaches it from either one), shaped like a real QueueItem so
    # a successful escape would actually parse - if the traversal guard has
    # a gap, this proves it by returning content instead of a plain 404,
    # not just "some exception happened."
    victim = {
        "queue_id": "victim",
        "capture_id": "victim",
        "category": "lookup",
        "title": "Should never be reachable",
        "body": "top secret",
        "captured": "2026-08-11T13:30:10-04:00",
        "created": "2026-08-18T16:08:22-04:00",
        "status": "pending",
        "enrichment": None,
        "processor_version": "0.2",
    }
    (sandbox.queue_dir.parent / "victim.json").write_text(json.dumps(victim), encoding="utf-8")
    return victim


def test_get_item_rejects_traversal_queue_id(sandbox):
    _plant_victim(sandbox)
    with pytest.raises(storage.ItemNotFoundError):
        storage.get_item("../../victim")


def test_update_item_rejects_traversal_queue_id(sandbox):
    _plant_victim(sandbox)
    with pytest.raises(storage.ItemNotFoundError):
        storage.update_item("../../victim", title="pwned")
    # The victim file itself must be untouched, not just inaccessible via
    # this function's normal return path.
    on_disk = json.loads((sandbox.queue_dir.parent / "victim.json").read_text())
    assert on_disk["title"] == "Should never be reachable"


def test_move_to_archived_rejects_traversal_queue_id(sandbox):
    _plant_victim(sandbox)
    with pytest.raises(storage.ItemNotFoundError):
        storage.move_to_archived("../../victim", "dismissed")
    assert (sandbox.queue_dir.parent / "victim.json").exists()


def test_keep_item_writes_vault_note_pushes_and_archives_as_filed(sandbox, monkeypatch):
    # The workflow itself (vault-write -> external push -> archive) is
    # covered here, without spinning up FastAPI - the leverage the
    # architecture review called out for moving it off main.py (candidate
    # c2).
    calls = {"recipe": 0}
    monkeypatch.setattr(
        storage, "push_recipe", lambda item: calls.__setitem__("recipe", calls["recipe"] + 1) or True
    )
    monkeypatch.setattr(storage, "push_media", lambda item: pytest.fail("should not push media for a recipe"))

    sandbox.seed(queue_id="a", category="recipe", title="Arroz con Gandules", body="Full recipe text.")

    updated = storage.keep_item("a")

    assert updated.status == "filed"
    assert calls["recipe"] == 1
    assert not (sandbox.queue_dir / "pending" / "a.json").exists()
    assert (sandbox.queue_dir / "archived" / "a.json").exists()
    assert list((sandbox.vault_dir / "Recipes").glob("*.md"))


def test_keep_item_succeeds_even_when_the_push_fails(sandbox, monkeypatch):
    monkeypatch.setattr(storage, "push_recipe", lambda item: False)
    sandbox.seed(queue_id="a", category="recipe", title="A recipe")

    updated = storage.keep_item("a")

    assert updated.status == "filed"


# No HTTP-level traversal test here, deliberately - checked by hand against
# a real uvicorn instance (not this file's in-process TestClient, which
# doesn't go through actual HTTP parsing) and both a literal ".." and a
# percent-encoded "%2e%2e"/"%2e%2e%2f%2e%2e%2fvictim" already get rejected
# by Starlette's own router before the app ever sees a queue_id - true with
# or without _validate_queue_id, confirmed against the pre-fix code too. An
# HTTP-level test asserting 404 here would pass for the wrong reason, the
# same mistake this file corrected once already (see the ItemNotFoundError
# import comment above). The function-level tests above are the real proof:
# CodeQL's flagged sink is a Python function taking an untrusted string, not
# a specific URL encoding trick, and _validate_queue_id protects it
# regardless of what any particular framework version's routing does or
# doesn't already catch.
