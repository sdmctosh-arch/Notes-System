import json
import os
import tempfile
from pathlib import Path

from app.config import QUEUE_ARCHIVED_DIR, QUEUE_PENDING_DIR
from app.models import ChatMessage, QueueItem


class ItemNotFoundError(Exception):
    pass


class InvalidMoveError(Exception):
    pass


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


def update_item(
    queue_id: str,
    *,
    category: str | None = None,
    title: str | None = None,
    body: str | None = None,
) -> QueueItem:
    path = _find_item_path(queue_id)
    if path is None:
        raise ItemNotFoundError(queue_id)
    item = _read_item(path)
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
    # Chat is deliberately pending-only, the same way move_to_archived's
    # source side is - once an item is archived/filed/dismissed the
    # interface treats it as read-only (PROJECT.md 10.4's Archive view),
    # and chat is a mutation like any other.
    path = QUEUE_PENDING_DIR / f"{queue_id}.json"
    if not path.is_file():
        raise ItemNotFoundError(queue_id)
    return _read_item(path)


def add_chat_messages(queue_id: str, messages: list[ChatMessage]) -> QueueItem:
    path = QUEUE_PENDING_DIR / f"{queue_id}.json"
    if not path.is_file():
        raise ItemNotFoundError(queue_id)
    item = _read_item(path)
    updated = item.model_copy(update={"chat": item.chat + messages})
    _write_item_atomic(path, updated)
    return updated


def move_to_archived(queue_id: str, new_status: str) -> QueueItem:
    # 10.6: the interface moves files from queue\pending\ to
    # queue\archived\ only - so a move is only valid starting from pending.
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
