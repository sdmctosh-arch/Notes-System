import json
import os
import re
import secrets
import tempfile
from datetime import datetime
from pathlib import Path

from app.config import QUEUE_ARCHIVED_DIR, QUEUE_PENDING_DIR, VAULT_DIR
from app.models import TASK_CATEGORIES, ChatMessage, QueueItem
from app.seerr import push_media
from app.tandoor import push_recipe
from app.vault import write_vault_note


class ItemNotFoundError(Exception):
    pass


class InvalidMoveError(Exception):
    pass


# Every queue_id below comes straight from a URL path segment, then gets
# dropped into f"{queue_id}.json" and joined onto QUEUE_PENDING_DIR/
# QUEUE_ARCHIVED_DIR with no other check - a value containing "../" could
# otherwise walk that join out of the queue directories entirely, to read,
# overwrite, or delete a file nothing about this API should be able to touch.
# A real queue_id is always one this system generated itself, either the
# processor's <capture_id>-NN format (digits, hyphens) or create_item's
# manual-<timestamp>-<hex> format (letters, digits, hyphens) - never a path
# separator or "..". Reject anything else before it reaches a path join.
_QUEUE_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _validate_queue_id(queue_id: str) -> None:
    if not _QUEUE_ID_RE.fullmatch(queue_id) or queue_id in (".", ".."):
        raise ItemNotFoundError(queue_id)


def _read_item(path: Path) -> QueueItem:
    with path.open("r", encoding="utf-8") as f:
        return QueueItem.model_validate(json.load(f))


def _write_item_atomic(path: Path, item: QueueItem) -> None:
    # PROJECT.md 10.6: write to a temp file, then rename. Never write in
    # place - a reader (or the processor, or another request) must never
    # see a half-written file.
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(item.model_dump_json(indent=2))
        os.replace(tmp_path, path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def list_pending_items(
    status: str | None = None, category: str | None = None
) -> list[QueueItem]:
    if not QUEUE_PENDING_DIR.is_dir():
        return []
    items = [_read_item(p) for p in sorted(QUEUE_PENDING_DIR.glob("*.json"))]
    if status:
        items = [i for i in items if i.status == status]
    if category:
        items = [i for i in items if i.category == category]
    return items


def list_archived_items(
    status: str | None = None, category: str | None = None
) -> list[QueueItem]:
    # Everything under queue/archived/ already has status archived, filed,
    # or dismissed - move_to_archived is the only writer into this
    # directory (PROJECT.md 10.6) - but the status filter stays for
    # symmetry with list_pending_items and to let a caller narrow to just
    # one of the three outcomes.
    if not QUEUE_ARCHIVED_DIR.is_dir():
        return []
    items = [_read_item(p) for p in sorted(QUEUE_ARCHIVED_DIR.glob("*.json"))]
    if status:
        items = [i for i in items if i.status == status]
    if category:
        items = [i for i in items if i.category == category]
    return items


def _find_item_path(queue_id: str) -> Path | None:
    _validate_queue_id(queue_id)
    for directory in (QUEUE_PENDING_DIR, QUEUE_ARCHIVED_DIR):
        candidate = directory / f"{queue_id}.json"
        if candidate.is_file():
            return candidate
    return None


def get_item(queue_id: str) -> QueueItem:
    path = _find_item_path(queue_id)
    if path is None:
        raise ItemNotFoundError(queue_id)
    return _read_item(path)


def _pending_item(queue_id: str) -> tuple[Path, QueueItem]:
    # The one seam every pending-only mutation (update/chat/pin/reenrich)
    # goes through - once an item is archived/filed/dismissed the interface
    # treats it as read-only (PROJECT.md 10.4's Archive view), and a filed
    # item in particular may already have a real vault note (and a
    # Tandoor/Seerr push) built from its current title/category, which an
    # edit here can't retroactively fix. A prior copy of this check used
    # _find_item_path (which also matches archived) and let a PATCH edit an
    # archived item (fixed in 7464f3b) - route every mutation through here
    # instead of re-deriving the pending path so that bug class can't recur.
    _validate_queue_id(queue_id)
    path = QUEUE_PENDING_DIR / f"{queue_id}.json"
    if not path.is_file():
        raise ItemNotFoundError(queue_id)
    return path, _read_item(path)


def update_item(
    queue_id: str,
    *,
    category: str | None = None,
    title: str | None = None,
    body: str | None = None,
) -> QueueItem:
    path, item = _pending_item(queue_id)
    updated = item.model_copy(
        update={
            k: v
            for k, v in {"category": category, "title": title, "body": body}.items()
            if v is not None
        }
    )
    _write_item_atomic(path, updated)
    return updated


def get_pending_item(queue_id: str) -> QueueItem:
    # Chat is a mutation like any other - see _pending_item.
    _, item = _pending_item(queue_id)
    return item


def add_chat_messages(queue_id: str, messages: list[ChatMessage]) -> QueueItem:
    path, item = _pending_item(queue_id)
    updated = item.model_copy(update={"chat": item.chat + messages})
    _write_item_atomic(path, updated)
    return updated


def set_pinned(queue_id: str, pinned: bool) -> QueueItem:
    path, item = _pending_item(queue_id)
    updated = item.model_copy(update={"pinned": pinned})
    _write_item_atomic(path, updated)
    return updated


def create_item(category: str, title: str | None, body: str) -> QueueItem:
    # PROJECT.md 10.5: a note added directly in the interface, not from the
    # phone - it has no capture file behind it (capture_id == queue_id, a
    # synthetic id, not a real Archive\Captures\*.md filename), so `manual`
    # marks it for the client. A third documented exception to "the
    # processor creates files in queue\pending\ only" (3.3's chat exception,
    # 10.6's reenrich-marker exception, and now this).
    now = datetime.now().astimezone()
    queue_id = "manual-{0}-{1}".format(now.strftime("%Y%m%d-%H%M%S"), secrets.token_hex(3))
    item = QueueItem(
        queue_id=queue_id,
        capture_id=queue_id,
        category=category,
        title=title,
        body=body,
        captured=now.isoformat(),
        created=now.isoformat(),
        status="pending",
        enrichment=None,
        processor_version="manual",
        manual=True,
    )
    path = QUEUE_PENDING_DIR / f"{queue_id}.json"
    _write_item_atomic(path, item)
    if category not in TASK_CATEGORIES:
        # Same request-file mechanism as the Re-enrich action (10.5) - the
        # processor enriches this on its next run within a few minutes,
        # exactly as if it had come in from the phone.
        (QUEUE_PENDING_DIR / f"{queue_id}.reenrich").touch()
    return item


def request_reenrich(queue_id: str) -> None:
    # PROJECT.md 10.5: the interface must not call the Gemini API for this -
    # it only writes a marker file. The processor picks it up on its next
    # run, redoes pass 2, and removes the marker either way (see
    # Invoke-ReenrichRequests in Invoke-NoteProcessor-v2.ps1). Pending-only,
    # the same as chat and set_pinned - see _pending_item.
    _pending_item(queue_id)
    marker = QUEUE_PENDING_DIR / f"{queue_id}.reenrich"
    marker.touch()


def unarchive_item(queue_id: str) -> QueueItem:
    # The reverse of move_to_archived, but narrower: only for archived or
    # dismissed - a filed item already wrote a real vault Markdown note
    # (and possibly pushed to Tandoor/Seerr), neither of which this can
    # safely undo, so Unarchive leaves it alone rather than pretending to.
    # `captured` is left untouched - it goes back to the Inbox at its real
    # age, not disguised as a fresh capture.
    _validate_queue_id(queue_id)
    path = QUEUE_ARCHIVED_DIR / f"{queue_id}.json"
    if not path.is_file():
        if (QUEUE_PENDING_DIR / f"{queue_id}.json").is_file():
            raise InvalidMoveError(f"{queue_id} is not archived")
        raise ItemNotFoundError(queue_id)

    item = _read_item(path)
    if item.status == "filed":
        raise InvalidMoveError(f"{queue_id} is filed and can't be unarchived")

    new_status = "enriched" if item.enrichment else "pending"
    updated = item.model_copy(update={"status": new_status})
    target = QUEUE_PENDING_DIR / f"{queue_id}.json"
    _write_item_atomic(target, updated)
    path.unlink()
    return updated


def keep_item(queue_id: str) -> QueueItem:
    # "Keep in vault" is vault-write, then external pushes, then archive as
    # filed - always in that order, always best-effort on the pushes (see
    # tandoor.push_recipe/seerr.push_media's own module docstrings for why
    # neither ever raises). That rule used to live in main.py's route
    # handler; it moves here, next to the other status-transition rules,
    # so the workflow itself is covered by a test on this function without
    # spinning up FastAPI (architecture review 2026-08-23, candidate c2).
    item = get_item(queue_id)
    write_vault_note(VAULT_DIR, item)
    if item.category == "recipe":
        push_recipe(item)
    elif item.category == "media":
        push_media(item)
    return move_to_archived(queue_id, "filed")


def move_to_archived(queue_id: str, new_status: str) -> QueueItem:
    # 10.6: the interface moves files from queue\pending\ to
    # queue\archived\ only - so a move is only valid starting from pending.
    _validate_queue_id(queue_id)
    path = QUEUE_PENDING_DIR / f"{queue_id}.json"
    if not path.is_file():
        if (QUEUE_ARCHIVED_DIR / f"{queue_id}.json").is_file():
            raise InvalidMoveError(f"{queue_id} is already archived")
        raise ItemNotFoundError(queue_id)

    item = _read_item(path)
    updated = item.model_copy(update={"status": new_status})
    target = QUEUE_ARCHIVED_DIR / f"{queue_id}.json"
    _write_item_atomic(target, updated)
    path.unlink()
    return updated
