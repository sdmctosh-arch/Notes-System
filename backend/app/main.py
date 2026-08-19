from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import auth, storage
from app.config import VAULT_DIR
from app.models import ItemUpdate, MoveRequest, QueueItem
from app.storage import InvalidMoveError, ItemNotFoundError
from app.vault import write_vault_note

app = FastAPI(title="Notes System API")

_MOVE_STATUS = {"archive": "archived", "dismiss": "dismissed", "keep": "filed"}


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login")
def login(body: LoginRequest, response: Response):
    if not auth.check_password(body.password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    auth.set_session_cookie(response)
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    auth.clear_session_cookie(response)
    return {"ok": True}


# Namespaced under /api because in production FastAPI also serves the built
# React app from this same origin (PROJECT.md 10.2) - the SPA has its own
# page at /items/{id}, and a bare /items/{id} API route would collide with
# it on direct navigation or a page reload.


@app.get("/api/items", response_model=list[QueueItem])
def list_items(status: str | None = None, category: str | None = None, _=Depends(auth.require_auth)):
    return storage.list_pending_items(status=status, category=category)


@app.get("/api/items/{queue_id}", response_model=QueueItem)
def get_item(queue_id: str, _=Depends(auth.require_auth)):
    try:
        return storage.get_item(queue_id)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")


@app.patch("/api/items/{queue_id}", response_model=QueueItem)
def update_item(queue_id: str, update: ItemUpdate, _=Depends(auth.require_auth)):
    try:
        return storage.update_item(
            queue_id, category=update.category, title=update.title, body=update.body
        )
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")


@app.post("/api/items/{queue_id}/move", response_model=QueueItem)
def move_item(queue_id: str, move: MoveRequest, _=Depends(auth.require_auth)):
    new_status = _MOVE_STATUS.get(move.action)
    if new_status is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{move.action}'. Use archive, dismiss, or keep.",
        )

    try:
        if move.action == "keep":
            item = storage.get_item(queue_id)
            write_vault_note(VAULT_DIR, item)
        return storage.move_to_archived(queue_id, new_status)
    except ItemNotFoundError:
        raise HTTPException(status_code=404, detail=f"No item {queue_id}")
    except InvalidMoveError as e:
        raise HTTPException(status_code=409, detail=str(e))


# --- Static frontend (production only - see Dockerfile) ---------------------
#
# The built React app lands here at image build time. Not present in local
# dev (Vite serves the frontend itself there), so this whole block is a
# no-op unless the directory exists - nothing to guard on an env var for.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if _STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Anything not already matched above (an /api/* route or /assets/*)
        # is a client-side route the SPA itself resolves - always hand back
        # the same shell and let React Router take it from there.
        return FileResponse(_STATIC_DIR / "index.html")
