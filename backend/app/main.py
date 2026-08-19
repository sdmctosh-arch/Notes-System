from fastapi import FastAPI, HTTPException

from app import storage
from app.config import VAULT_DIR
from app.models import ItemUpdate, MoveRequest, QueueItem
from app.storage import InvalidMoveError, ItemNotFoundError
from app.vault import write_vault_note

app = FastAPI(title="Notes System API")

_MOVE_STATUS = {"archive": "archived", "dismiss": "dismissed", "keep": "filed"}


@app.get("/items", response_model=list[QueueItem])
def list_items(status: str | None = None, category: str | None = None):
    return storage.list_pending_items(status=status, category=category)


@app.get("/items/{queue_id}", response_model=QueueItem)
def get_item(queue_id: str):
    try:
        return storage.get_item(queue_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")


@app.patch("/items/{queue_id}", response_model=QueueItem)
def update_item(queue_id: str, update: ItemUpdate):
    try:
        return storage.update_item(
            queue_id, category=update.category, title=update.title, body=update.body
        )
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")


@app.post("/items/{queue_id}/move", response_model=QueueItem)
def move_item(queue_id: str, move: MoveRequest):
    new_status = _MOVE_STATUS.get(move.action)
    if new_status is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{move.action}'. Use archive, dismiss, or keep.",
        )

    try:
        if move.action == "keep":
            # Write the vault note first: if this fails, nothing else has
            # changed yet. A retry after a failure here writes a second
            # copy rather than losing the note - an acceptable edge case
            # for a single-user tool, not one worth a two-phase commit for.
            item = storage.get_item(queue_id)
            write_vault_note(VAULT_DIR, item)
        return storage.move_to_archived(queue_id, new_status)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")
    except InvalidMoveError as e:
        raise HTTPException(status_code=409, detail=str(e))
