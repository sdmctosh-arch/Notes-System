from pathlib import Path

from app.models import QueueItem, SearchResult
from app.vault import list_vault_notes, read_vault_note


def _matches(haystack: str, query: str) -> bool:
    return query.lower() in haystack.lower()


def _snippet(text: str | None, query: str, radius: int = 60) -> str:
    text = text or ""
    idx = text.lower().find(query.lower())
    if idx == -1:
        return text[:160].strip()
    start = max(0, idx - radius)
    end = min(len(text), idx + len(query) + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return (prefix + text[start:end] + suffix).strip()


def _item_text(item: QueueItem) -> str:
    parts = [item.title, item.body]
    if item.enrichment:
        parts += [item.enrichment.summary, item.enrichment.detail]
    return " ".join(p for p in parts if p)


def search_items(items: list[QueueItem], query: str, location: str) -> list[SearchResult]:
    results = []
    for item in items:
        text = _item_text(item)
        if _matches(text, query):
            results.append(
                SearchResult(
                    kind="item",
                    title=item.title or item.capture_id,
                    snippet=_snippet(text, query),
                    queue_id=item.queue_id,
                    location=location,
                    category=item.category,
                )
            )
    return results


def search_vault(vault_root: Path, query: str) -> list[SearchResult]:
    results = []
    for folder, notes in list_vault_notes(vault_root).items():
        for note in notes:
            content = read_vault_note(vault_root, folder, note["filename"])
            haystack = f"{note['title']}\n{content}"
            if _matches(haystack, query):
                results.append(
                    SearchResult(
                        kind="vault_note",
                        title=note["title"],
                        snippet=_snippet(content, query),
                        folder=folder,
                        filename=note["filename"],
                    )
                )
    return results
