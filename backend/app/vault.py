import re
from pathlib import Path
from urllib.parse import urlparse

from app.models import QueueItem

# Same mapping the deleted PowerShell Write-VaultNote used. Categories with
# no defined vault folder (lookup, todo, media, reference, grocery) fall
# back to Unclassified, same as before.
CATEGORY_FOLDER = {
    "recipe": "Recipes",
    "project": "Projects",
    "idea": "Ideas",
    "unclassified": "Unclassified",
}

_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _is_clean_url(value: str | None) -> bool:
    if not value or re.search(r"\s", value):
        return False
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _safe_filename(text: str | None, fallback: str) -> str:
    text = text or ""
    clean = _INVALID_FILENAME_CHARS.sub(" ", text)
    clean = re.sub(r"\s+", " ", clean).strip(" .")
    if len(clean) > 80:
        clean = clean[:80].strip()
    return clean or fallback


def _unique_path(directory: Path, filename: str) -> Path:
    candidate = directory / filename
    if not candidate.exists():
        return candidate
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    n = 1
    while True:
        candidate = directory / f"{stem}-{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def _enrichment_section(item: QueueItem) -> list[str]:
    e = item.enrichment
    if e is None:
        return []
    lines = ["## Enrichment", ""]
    if e.summary:
        lines += [e.summary, ""]
    if e.detail:
        lines += [e.detail, ""]
    if e.citations:
        lines.append("**Sources:**")
        for c in e.citations:
            lines.append(f"- [{c.title}]({c.url})")
        lines.append("")
    return lines


def write_vault_note(vault_root: Path, item: QueueItem) -> Path:
    folder = CATEGORY_FOLDER.get(item.category, "Unclassified")
    directory = vault_root / folder
    directory.mkdir(parents=True, exist_ok=True)

    title = item.title or item.capture_id
    escaped_title = title.replace('"', '\\"')

    frontmatter = ["---", f'title: "{escaped_title}"', f"category: {item.category}"]
    frontmatter.append(f"captured: {item.captured}")
    frontmatter.append(f"capture_id: {item.capture_id}")
    if _is_clean_url(item.url):
        frontmatter.append(f"url: {item.url}")
    frontmatter.append(f"processor_version: {item.processor_version}")
    frontmatter.append("---")
    frontmatter.append("")

    body_lines = []
    if item.ambiguity_note:
        body_lines += [f"> [!note] Classifier note\n> {item.ambiguity_note}", ""]
    body_lines.append(item.body or "")
    body_lines.append("")
    body_lines += _enrichment_section(item)

    content = "\n".join(frontmatter + body_lines)

    filename = _safe_filename(title, item.capture_id) + ".md"
    target = _unique_path(directory, filename)
    target.write_text(content, encoding="utf-8")
    return target
