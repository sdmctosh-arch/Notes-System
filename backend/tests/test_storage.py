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


def test_api_rejects_dot_dot_queue_id(sandbox):
    # A single ".." path segment (no slash needed inside it) routes to
    # {queue_id} exactly like any other value - the plain HTTP-level proof
    # that the guard is wired into the actual endpoint, not just the
    # storage-layer unit tests above.
    resp = sandbox.client.get("/api/items/..")
    assert resp.status_code == 404
