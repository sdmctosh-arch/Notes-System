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


# --- Read-only vault browsing (the "Vault" view) -----------------------------
#
# VAULT_DIR is the user's whole real notes vault (E:\notes), not a directory
# this system owns - it's the same mount Obsidian or whatever else points at.
# Only look inside the folders write_vault_note actually writes to, never
# walk the vault root itself, or this view would expose unrelated personal
# files that have nothing to do with this system.
VAULT_FOLDERS = sorted(set(CATEGORY_FOLDER.values()))


def _parse_frontmatter(text: str) -> dict:
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}
    fm: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, value = line.partition(":")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1].replace('\\"', '"')
        fm[key.strip()] = value
    return fm


def list_vault_notes(vault_root: Path) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for folder_name in VAULT_FOLDERS:
        folder = vault_root / folder_name
        if not folder.is_dir():
            continue
        notes = []
        for md in sorted(folder.glob("*.md")):
            fm = _parse_frontmatter(md.read_text(encoding="utf-8"))
            notes.append(
                {
                    "filename": md.name,
                    "title": fm.get("title") or md.stem,
                    "captured": fm.get("captured"),
                }
            )
        if notes:
            result[folder_name] = notes
    return result


def read_vault_note(vault_root: Path, folder: str, filename: str) -> str:
    if folder not in VAULT_FOLDERS:
        raise FileNotFoundError(folder)

    # filename comes straight from the URL path - resolve and check it
    # actually lands inside vault_root/folder before reading, so a
    # "../../something-else" can't escape the vault folders above.
    target = (vault_root / folder / filename).resolve()
    allowed_root = (vault_root / folder).resolve()
    if allowed_root not in target.parents and target != allowed_root:
        raise FileNotFoundError(filename)
    if target.suffix != ".md" or not target.is_file():
        raise FileNotFoundError(filename)

    return target.read_text(encoding="utf-8")
