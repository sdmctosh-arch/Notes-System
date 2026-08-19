from pydantic import BaseModel

# Mirrors the JSON actually written by Write-QueueRow in
# Invoke-NoteProcessor-v2.ps1, not just the PROJECT.md example - the two
# drifted during Stage 1 (e.g. capture_path was never implemented).


class Citation(BaseModel):
    title: str
    url: str


class Embed(BaseModel):
    type: str
    video_id: str


class Enrichment(BaseModel):
    kind: str
    summary: str
    detail: str
    citations: list[Citation] = []
    embed: Embed | None = None
    structured: dict | None = None
    model: str
    enriched_at: str


class QueueItem(BaseModel):
    queue_id: str
    capture_id: str
    category: str
    title: str | None = None
    body: str | None = None
    url: str | None = None
    url_rejected: str | None = None
    media_type: str | None = None
    timing: str | None = None
    proposed_automation: str | None = None
    approved_automation: str | None = None
    ambiguity_note: str | None = None
    captured: str
    created: str
    status: str
    enrichment: Enrichment | None = None
    processor_version: str


class ItemUpdate(BaseModel):
    # PATCH body. Only category, title, and body are editable per
    # PROJECT.md 10.5 - status changes go through the move action instead,
    # so a client can't sidestep the pending-only move restriction by
    # PATCHing status directly.
    category: str | None = None
    title: str | None = None
    body: str | None = None


class MoveRequest(BaseModel):
    action: str  # "archive" | "dismiss" | "keep"
