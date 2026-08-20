from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import auth, storage
from app.capture import read_capture
from app.config import ARCHIVE_DIR, VAULT_DIR
from app.models import (
    CaptureContent,
    ItemUpdate,
    MoveRequest,
    QueueItem,
    SearchResult,
    VaultNoteContent,
    VaultNoteSummary,
)
from app.search import search_items, search_vault
from app.storage import InvalidMoveError, ItemNotFoundError
from app.tandoor import push_recipe
from app.vault import list_vault_notes, read_vault_note, write_vault_note

app = FastAPI(title="Notes System API")

_MOVE_STATUS = {"archive": "archived", "dismiss": "dismissed", "keep": "filed"}


@app.get("/api/health")
def health():
    # Unauthenticated on purpose - this is what docker-compose's healthcheck
    # polls, and it has no session cookie to send.
    return {"ok": True}


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


@app.get("/api/archive", response_model=list[QueueItem])
def list_archive(status: str | None = None, category: str | None = None, _=Depends(auth.require_auth)):
    # PROJECT.md 10.4: "Shows items with status archived, filed, or
    # dismissed. Read only." - a distinct read-only endpoint rather than a
    # location= param on /api/items, since nothing here is writable the
    # way a pending item is.
    return storage.list_archived_items(status=status, category=category)


@app.get("/api/vault", response_model=dict[str, list[VaultNoteSummary]])
def get_vault(_=Depends(auth.require_auth)):
    # Not spec'd in PROJECT.md - VAULT_DIR is the user's whole real notes
    # vault, so this only lists the category folders write_vault_note
    # itself writes to (see vault.VAULT_FOLDERS), never the vault root.
    return list_vault_notes(VAULT_DIR)


@app.get("/api/vault/{folder}/{filename}", response_model=VaultNoteContent)
def get_vault_note(folder: str, filename: str, _=Depends(auth.require_auth)):
    try:
        content = read_vault_note(VAULT_DIR, folder, filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No vault note {folder}/{filename}")
    return VaultNoteContent(folder=folder, filename=filename, content=content)


@app.get("/api/search", response_model=list[SearchResult])
def search(q: str = "", _=Depends(auth.require_auth)):
    query = q.strip()
    if not query:
        return []
    results = search_items(storage.list_pending_items(), query, "inbox")
    results += search_items(storage.list_archived_items(), query, "archive")
    results += search_vault(VAULT_DIR, query)
    return results


@app.get("/api/capture/{capture_id}", response_model=CaptureContent)
def get_capture(capture_id: str, _=Depends(auth.require_auth)):
    try:
        content = read_capture(ARCHIVE_DIR, capture_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"No capture {capture_id}")
    return CaptureContent(capture_id=capture_id, content=content)


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
            if item.category == "recipe":
                push_recipe(item)
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
