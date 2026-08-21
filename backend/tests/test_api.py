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


def test_unarchive_archived_item_returns_to_pending_enriched(sandbox):
    sandbox.seed(queue_id="a")  # default seed has enrichment set
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})

    resp = sandbox.client.post("/api/items/a/unarchive")
    assert resp.status_code == 200
    assert resp.json()["status"] == "enriched"
    assert resp.json()["captured"] == "2026-08-11T13:30:10-04:00"  # real age, not reset

    assert not (sandbox.queue_dir / "archived" / "a.json").exists()
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk["status"] == "enriched"


def test_unarchive_dismissed_item_returns_to_pending(sandbox):
    sandbox.seed(queue_id="a")
    sandbox.client.post("/api/items/a/move", json={"action": "dismiss"})

    resp = sandbox.client.post("/api/items/a/unarchive")
    assert resp.status_code == 200
    assert resp.json()["status"] == "enriched"


def test_unarchive_recomputes_pending_status_without_enrichment(sandbox):
    sandbox.seed(queue_id="a", status="pending", enrichment=None)
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})

    resp = sandbox.client.post("/api/items/a/unarchive")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_unarchive_filed_item_is_409(sandbox):
    sandbox.seed(queue_id="a", category="idea", title="An idea")
    sandbox.client.post("/api/items/a/move", json={"action": "keep"})

    resp = sandbox.client.post("/api/items/a/unarchive")
    assert resp.status_code == 409
    # untouched - still filed, still archived
    assert (sandbox.queue_dir / "archived" / "a.json").exists()


def test_unarchive_pending_item_is_409(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.post("/api/items/a/unarchive")
    assert resp.status_code == 409


def test_unarchive_missing_item_is_404(sandbox):
    resp = sandbox.client.post("/api/items/nope/unarchive")
    assert resp.status_code == 404


def test_unarchive_requires_auth(sandbox):
    resp = sandbox.raw_client.post("/api/items/a/unarchive")
    assert resp.status_code == 401


def test_move_unknown_action_is_400(sandbox):
    sandbox.seed(queue_id="a")
    resp = sandbox.client.post("/api/items/a/move", json={"action": "delete"})
    assert resp.status_code == 400


def test_archive_view_lists_only_archived_items(sandbox):
    sandbox.seed(queue_id="pending-1")
    sandbox.seed(queue_id="to-archive")
    sandbox.seed(queue_id="to-dismiss")
    sandbox.client.post("/api/items/to-archive/move", json={"action": "archive"})
    sandbox.client.post("/api/items/to-dismiss/move", json={"action": "dismiss"})

    resp = sandbox.client.get("/api/archive")
    assert resp.status_code == 200
    ids = {i["queue_id"] for i in resp.json()}
    assert ids == {"to-archive", "to-dismiss"}
    assert "pending-1" not in ids


def test_archive_view_filters_by_status_and_category(sandbox):
    sandbox.seed(queue_id="a", category="lookup")
    sandbox.seed(queue_id="b", category="recipe")
    sandbox.client.post("/api/items/a/move", json={"action": "dismiss"})
    sandbox.client.post("/api/items/b/move", json={"action": "archive"})

    resp = sandbox.client.get("/api/archive", params={"status": "dismissed"})
    assert [i["queue_id"] for i in resp.json()] == ["a"]

    resp = sandbox.client.get("/api/archive", params={"category": "recipe"})
    assert [i["queue_id"] for i in resp.json()] == ["b"]


def test_archive_view_requires_auth(sandbox):
    resp = sandbox.raw_client.get("/api/archive")
    assert resp.status_code == 401


def test_vault_endpoint_lists_notes_by_folder(sandbox):
    directory = sandbox.vault_dir / "Recipes"
    directory.mkdir(parents=True)
    (directory / "arroz.md").write_text(
        '---\ntitle: "Arroz con Gandules"\ncategory: recipe\ncaptured: 2026-08-11T13:30:10-04:00\n---\n\nBody.\n',
        encoding="utf-8",
    )

    resp = sandbox.client.get("/api/vault")
    assert resp.status_code == 200
    assert resp.json() == {
        "Recipes": [
            {"filename": "arroz.md", "title": "Arroz con Gandules", "captured": "2026-08-11T13:30:10-04:00"}
        ]
    }


def test_vault_endpoint_requires_auth(sandbox):
    resp = sandbox.raw_client.get("/api/vault")
    assert resp.status_code == 401


def test_vault_note_endpoint_returns_content(sandbox):
    directory = sandbox.vault_dir / "Recipes"
    directory.mkdir(parents=True)
    (directory / "arroz.md").write_text("---\ntitle: \"Arroz\"\n---\n\nBody.\n", encoding="utf-8")

    resp = sandbox.client.get("/api/vault/Recipes/arroz.md")
    assert resp.status_code == 200
    body = resp.json()
    assert body["folder"] == "Recipes"
    assert body["filename"] == "arroz.md"
    assert "Body." in body["content"]


def test_vault_note_endpoint_404_for_missing_file(sandbox):
    resp = sandbox.client.get("/api/vault/Recipes/does-not-exist.md")
    assert resp.status_code == 404


def test_vault_note_endpoint_404_for_unknown_folder(sandbox):
    resp = sandbox.client.get("/api/vault/NotARealFolder/x.md")
    assert resp.status_code == 404


def test_search_spans_inbox_archive_and_vault(sandbox):
    sandbox.seed(queue_id="inbox-1", title="Pier 66 laundry question")
    sandbox.seed(queue_id="to-archive", title="Pier 66 opening hours")
    sandbox.client.post("/api/items/to-archive/move", json={"action": "archive"})

    directory = sandbox.vault_dir / "Recipes"
    directory.mkdir(parents=True)
    (directory / "note.md").write_text(
        '---\ntitle: "Pier 66 dinner recipe"\n---\n\nBody.\n', encoding="utf-8"
    )

    resp = sandbox.client.get("/api/search", params={"q": "Pier 66"})
    assert resp.status_code == 200
    results = resp.json()
    kinds = {(r["kind"], r.get("location"), r.get("queue_id"), r.get("filename")) for r in results}
    assert ("item", "inbox", "inbox-1", None) in kinds
    assert ("item", "archive", "to-archive", None) in kinds
    assert ("vault_note", None, None, "note.md") in kinds


def test_search_empty_query_returns_no_results(sandbox):
    sandbox.seed(queue_id="a", title="Pier 66 laundry")
    resp = sandbox.client.get("/api/search", params={"q": ""})
    assert resp.status_code == 200
    assert resp.json() == []


def test_search_requires_auth(sandbox):
    resp = sandbox.raw_client.get("/api/search", params={"q": "x"})
    assert resp.status_code == 401


def test_capture_endpoint_returns_content(sandbox):
    (sandbox.archive_dir / "2026-08-11-13-30-10-pm.md").write_text(
        "---\nid: 2026-08-11-13-30-10-pm\n---\n\nPack for Florida tonight.\n",
        encoding="utf-8",
    )
    resp = sandbox.client.get("/api/capture/2026-08-11-13-30-10-pm")
    assert resp.status_code == 200
    body = resp.json()
    assert body["capture_id"] == "2026-08-11-13-30-10-pm"
    assert "Pack for Florida tonight." in body["content"]


def test_capture_endpoint_404_for_missing_file(sandbox):
    resp = sandbox.client.get("/api/capture/does-not-exist")
    assert resp.status_code == 404


def test_capture_endpoint_requires_auth(sandbox):
    resp = sandbox.raw_client.get("/api/capture/anything")
    assert resp.status_code == 401


def test_keep_recipe_succeeds_even_when_tandoor_push_fails(sandbox, monkeypatch):
    from app import main

    def failing_push(item):
        return False

    monkeypatch.setattr(main, "push_recipe", failing_push)
    sandbox.seed(queue_id="a", category="recipe", title="A recipe")

    resp = sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "filed"


def test_keep_non_recipe_never_calls_tandoor(sandbox, monkeypatch):
    from app import main

    called = {"n": 0}

    def counting_push(item):
        called["n"] += 1
        return True

    monkeypatch.setattr(main, "push_recipe", counting_push)
    sandbox.seed(queue_id="a", category="idea", title="An idea")

    sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert called["n"] == 0


def test_keep_media_succeeds_even_when_seerr_push_fails(sandbox, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "push_media", lambda item: False)
    sandbox.seed(queue_id="a", category="media", title="A show", media_type="tv")

    resp = sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "filed"


def test_keep_non_media_never_calls_seerr(sandbox, monkeypatch):
    from app import main

    called = {"n": 0}
    monkeypatch.setattr(main, "push_media", lambda item: called.__setitem__("n", called["n"] + 1))
    sandbox.seed(queue_id="a", category="idea", title="An idea")

    sandbox.client.post("/api/items/a/move", json={"action": "keep"})
    assert called["n"] == 0


def test_chat_appends_user_and_model_messages(sandbox, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "send_message", lambda item, message: "Yes, open until 8pm.")
    sandbox.seed(queue_id="a")

    resp = sandbox.client.post("/api/items/a/chat", json={"message": "Weekend hours?"})
    assert resp.status_code == 200
    chat = resp.json()["chat"]
    assert len(chat) == 2
    assert chat[0] == {"role": "user", "text": "Weekend hours?", "at": chat[0]["at"]}
    assert chat[1]["role"] == "model"
    assert chat[1]["text"] == "Yes, open until 8pm."

    # persisted to disk, not just the response
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert len(on_disk["chat"]) == 2


def test_chat_accumulates_across_multiple_messages(sandbox, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "send_message", lambda item, message: f"reply to: {message}")
    sandbox.seed(queue_id="a")

    sandbox.client.post("/api/items/a/chat", json={"message": "first"})
    resp = sandbox.client.post("/api/items/a/chat", json={"message": "second"})

    texts = [m["text"] for m in resp.json()["chat"]]
    assert texts == ["first", "reply to: first", "second", "reply to: second"]


def test_chat_404_for_missing_item(sandbox):
    resp = sandbox.client.post("/api/items/nope/chat", json={"message": "hi"})
    assert resp.status_code == 404


def test_chat_404_for_archived_item(sandbox):
    sandbox.seed(queue_id="a")
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})

    resp = sandbox.client.post("/api/items/a/chat", json={"message": "hi"})
    assert resp.status_code == 404


def test_chat_502_when_gemini_call_fails(sandbox, monkeypatch):
    from app import main
    from app.gemini_chat import ChatError

    def failing(item, message):
        raise ChatError("boom")

    monkeypatch.setattr(main, "send_message", failing)
    sandbox.seed(queue_id="a")

    resp = sandbox.client.post("/api/items/a/chat", json={"message": "hi"})
    assert resp.status_code == 502
    # and nothing got persisted from the failed attempt
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk.get("chat", []) == []


def test_chat_requires_auth(sandbox):
    resp = sandbox.raw_client.post("/api/items/a/chat", json={"message": "hi"})
    assert resp.status_code == 401


def test_set_pinned_true_and_false(sandbox):
    sandbox.seed(queue_id="a")

    resp = sandbox.client.patch("/api/items/a/pin", json={"pinned": True})
    assert resp.status_code == 200
    assert resp.json()["pinned"] is True
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk["pinned"] is True

    resp = sandbox.client.patch("/api/items/a/pin", json={"pinned": False})
    assert resp.status_code == 200
    assert resp.json()["pinned"] is False


def test_set_pinned_404_for_missing_item(sandbox):
    resp = sandbox.client.patch("/api/items/nope/pin", json={"pinned": True})
    assert resp.status_code == 404


def test_set_pinned_404_for_archived_item(sandbox):
    sandbox.seed(queue_id="a")
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})

    resp = sandbox.client.patch("/api/items/a/pin", json={"pinned": True})
    assert resp.status_code == 404


def test_set_pinned_requires_auth(sandbox):
    resp = sandbox.raw_client.patch("/api/items/a/pin", json={"pinned": True})
    assert resp.status_code == 401


def test_reenrich_writes_a_marker_file(sandbox):
    sandbox.seed(queue_id="a")

    resp = sandbox.client.post("/api/items/a/reenrich")
    assert resp.status_code == 202

    assert (sandbox.queue_dir / "pending" / "a.reenrich").exists()
    # the item itself is untouched - only the processor changes it
    on_disk = json.loads((sandbox.queue_dir / "pending" / "a.json").read_text())
    assert on_disk["status"] == "enriched"


def test_reenrich_404_for_missing_item(sandbox):
    resp = sandbox.client.post("/api/items/nope/reenrich")
    assert resp.status_code == 404
    assert not (sandbox.queue_dir / "pending" / "nope.reenrich").exists()


def test_reenrich_404_for_archived_item(sandbox):
    sandbox.seed(queue_id="a")
    sandbox.client.post("/api/items/a/move", json={"action": "archive"})

    resp = sandbox.client.post("/api/items/a/reenrich")
    assert resp.status_code == 404
    assert not (sandbox.queue_dir / "archived" / "a.reenrich").exists()


def test_reenrich_requires_auth(sandbox):
    resp = sandbox.raw_client.post("/api/items/a/reenrich")
    assert resp.status_code == 401


def test_create_item_writes_a_pending_item(sandbox):
    resp = sandbox.client.post("/api/items", json={"category": "idea", "title": "Deck idea", "body": "Add a pergola."})
    assert resp.status_code == 201
    created = resp.json()
    assert created["category"] == "idea"
    assert created["title"] == "Deck idea"
    assert created["body"] == "Add a pergola."
    assert created["status"] == "pending"
    assert created["enrichment"] is None
    assert created["manual"] is True
    assert created["capture_id"] == created["queue_id"]

    on_disk = json.loads((sandbox.queue_dir / "pending" / f"{created['queue_id']}.json").read_text())
    assert on_disk["manual"] is True

    # now shows up in the inbox listing like anything else
    resp = sandbox.client.get("/api/items")
    assert created["queue_id"] in {i["queue_id"] for i in resp.json()}


def test_create_item_requests_enrichment_for_an_enrichable_category(sandbox):
    resp = sandbox.client.post("/api/items", json={"category": "lookup", "body": "Does the library have a 3D printer?"})
    created = resp.json()
    assert (sandbox.queue_dir / "pending" / f"{created['queue_id']}.reenrich").exists()


def test_create_item_skips_reenrich_request_for_a_task_category(sandbox):
    resp = sandbox.client.post("/api/items", json={"category": "todo", "body": "Buy milk"})
    created = resp.json()
    assert not (sandbox.queue_dir / "pending" / f"{created['queue_id']}.reenrich").exists()


def test_create_item_rejects_empty_body(sandbox):
    resp = sandbox.client.post("/api/items", json={"category": "idea", "body": ""})
    assert resp.status_code == 422


def test_create_item_rejects_unknown_category(sandbox):
    resp = sandbox.client.post("/api/items", json={"category": "not-a-real-category", "body": "x"})
    assert resp.status_code == 422


def test_create_item_requires_auth(sandbox):
    resp = sandbox.raw_client.post("/api/items", json={"category": "idea", "body": "x"})
    assert resp.status_code == 401
