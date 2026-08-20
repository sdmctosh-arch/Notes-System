import json


def test_health_is_unauthenticated(sandbox):
    resp = sandbox.raw_client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_list_items_empty(sandbox):
    resp = sandbox.client.get("/api/items")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_and_filter(sandbox):
    sandbox.seed(queue_id="a", category="lookup", status="enriched")
    sandbox.seed(queue_id="b", category="recipe", status="pending")

    resp = sandbox.client.get("/api/items")
    assert {i["queue_id"] for i in resp.json()} == {"a", "b"}

    resp = sandbox.client.get("/api/items", params={"category": "recipe"})
    assert [i["queue_id"] for i in resp.json()] == ["b"]

    resp = sandbox.client.get("/api/items", params={"status": "enriched"})
    assert [i["queue_id"] for i in resp.json()] == ["a"]


def test_get_item(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.get("/api/items/a")
    assert resp.status_code == 200
    assert resp.json()["queue_id"] == "a"
    assert resp.json()["enrichment"]["kind"] == "answer"


def test_get_item_404(sandbox):
    resp = sandbox.client.get("/api/items/does-not-exist")
    assert resp.status_code == 404


def test_patch_updates_fields_and_persists_to_disk(sandbox):
    sandbox.seed(queue_id="a", category="lookup", title="Old title")

    resp = sandbox.client.patch("/api/items/a", json={"title": "New title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New title"
    assert resp.json()["category"] == "lookup"  # untouched field survives

    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk["title"] == "New title"


def test_patch_404(sandbox):
    resp = sandbox.client.patch("/api/items/nope", json={"title": "x"})
    assert resp.status_code == 404


def test_patch_category_accepts_known_value(sandbox):
    sandbox.seed(queue_id="a", category="lookup")
    resp = sandbox.client.patch("/api/items/a", json={"category": "todo"})
    assert resp.status_code == 200
    assert resp.json()["category"] == "todo"


def test_patch_category_rejects_unknown_value(sandbox):
    sandbox.seed(queue_id="a", category="lookup")
    resp = sandbox.client.patch("/api/items/a", json={"category": "not-a-real-category"})
    assert resp.status_code == 422

    # and the file on disk is untouched
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk["category"] == "lookup"


def test_move_archive(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.post("/api/items/a/move", json={"action": "archive"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"

    assert not (sandbox.queue_dir / "pending" / "a.json").exists()
    archived = json.loads((sandbox.queue_dir / "archived" / "a.json").read_text())
    assert archived["status"] == "archived"


def test_move_dismiss(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.post("/api/items/a/move", json={"action": "dismiss"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "dismissed"
    assert not (sandbox.queue_dir / "pending" / "a.json").exists()
    assert (sandbox.queue_dir / "archived" / "a.json").exists()


def test_move_keep_writes_vault_note_and_archives(sandbox):
    sandbox.seed(
        queue_id="a",
        category="recipe",
        title="Arroz con Gandules",
        body="Full recipe text here.",
    )

    resp = sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "filed"

    assert not (sandbox.queue_dir / "pending" / "a.json").exists()
    assert (sandbox.queue_dir / "archived" / "a.json").exists()

    note = list((sandbox.vault_dir / "Recipes").glob("*.md"))
    assert len(note) == 1
    content = note[0].read_text()
    assert "Arroz con Gandules" in content
    assert "Full recipe text here." in content
    assert "Pier 66 has laundry." in content  # enrichment summary made it in


def test_move_keep_unmapped_category_falls_back_to_unclassified(sandbox):
    sandbox.seed(queue_id="a", category="lookup", title="Some question")
    sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert list((sandbox.vault_dir / "Unclassified").glob("*.md"))


def test_move_already_archived_is_409(sandbox):
    sandbox.seed(queue_id="a")
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})
    resp = sandbox.client.post("/api/items/a/move", json={"action": "archive"})
    assert resp.status_code == 409


def test_move_missing_item_is_404(sandbox):
    resp = sandbox.client.post("/api/items/nope/move", json={"action": "archive"})
    assert resp.status_code == 404


def test_move_unknown_action_is_400(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.post("/api/items/a/move", json={"action": "delete"})
    assert resp.status_code == 400
