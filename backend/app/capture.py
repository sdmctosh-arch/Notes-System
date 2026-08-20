"""Read-only access to the original captures (PROJECT.md 10.4, "Capture").

ARCHIVE_DIR is the read-only /data/archive bind mount -> E:\\notes\\Archive\\
Captures on the host (PROJECT.md 10.2). The processor is the only writer;
this module only ever reads.
"""

from pathlib import Path


def read_capture(archive_dir: Path, capture_id: str) -> str:
    # capture_id comes straight from the URL path - resolve and check it
    # actually lands inside archive_dir before reading, the same guard
    # vault.read_vault_note uses, so a "../../something-else" can't escape
    # the archive directory.
    target = (archive_dir / f"{capture_id}.md").resolve()
    allowed_root = archive_dir.resolve()
    if allowed_root not in target.parents and target != allowed_root:
        raise FileNotFoundError(capture_id)
    if not target.is_file():
        raise FileNotFoundError(capture_id)

    return target.read_text(encoding="utf-8")
