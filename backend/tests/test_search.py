from app.models import Enrichment, QueueItem
from app.search import search_items, search_vault


def _item(**overrides):
    base = dict(
        queue_id="a",
        capture_id="a",
        category="lookup",
        title="Pier 66 laundry",
        body="Lookup if Pier 66 has laundry.",
        captured="2026-08-11T13:30:10-04:00",
        created="2026-08-11T13:30:10-04:00",
        status="enriched",
        enrichment=None,
        processor_version="0.2",
    )
    base.update(overrides)
    return QueueItem(**base)


def test_search_items_matches_title():
    items = [
        _item(title="Pier 66 laundry"),
        _item(queue_id="b", title="Something unrelated", body="nothing to do with the other item"),
    ]
    results = search_items(items, "pier 66", "inbox")
    assert [r.queue_id for r in results] == ["a"]
    assert results[0].location == "inbox"
    assert results[0].kind == "item"


def test_search_items_matches_body_and_enrichment():
    items = [
        _item(queue_id="b", title="x", body="a mention of gandules here"),
        _item(
            queue_id="c",
            title="y",
            body="no match",
            enrichment=Enrichment(
                kind="answer", summary="talks about gandules too", detail="", citations=[], model="m", enriched_at="now"
            ),
        ),
    ]
    results = search_items(items, "gandules", "archive")
    assert {r.queue_id for r in results} == {"b", "c"}


def test_search_items_is_case_insensitive():
    items = [_item(title="PIER 66 LAUNDRY")]
    assert len(search_items(items, "pier 66", "inbox")) == 1


def test_search_items_snippet_contains_query_context():
    items = [_item(body="a long sentence with the word laundry buried inside it somewhere")]
    results = search_items(items, "laundry", "inbox")
    assert "laundry" in results[0].snippet


def test_search_vault_matches_title_and_content(tmp_path):
    directory = tmp_path / "Recipes"
    directory.mkdir()
    (directory / "arroz.md").write_text(
        '---\ntitle: "Arroz con Gandules"\n---\n\nUses 2 cups of rice.\n', encoding="utf-8"
    )
    (directory / "other.md").write_text('---\ntitle: "Other"\n---\n\nNothing relevant.\n', encoding="utf-8")

    results = search_vault(tmp_path, "gandules")
    assert len(results) == 1
    assert results[0].kind == "vault_note"
    assert results[0].folder == "Recipes"
    assert results[0].filename == "arroz.md"

    results = search_vault(tmp_path, "rice")
    assert [r.filename for r in results] == ["arroz.md"]
