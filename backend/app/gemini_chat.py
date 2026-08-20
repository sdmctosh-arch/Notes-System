"""Live follow-up chat about a note, using the note and its enrichment as
context.

This is the one deliberate exception to PROJECT.md 3.3's "the interface
does not call the Gemini API" - a real conversation needs a synchronous
reply, which the processor's file-based, every-5-minutes pipeline can't
give. Enrichment and classification stay processor-only and file-based
exactly as before; only chat calls Gemini directly, from here.

The request/response shape mirrors scripts/Invoke-NoteProcessor-v2.ps1's
Invoke-Enrichment function exactly (endpoint, headers, response parsing) -
that shape was verified against the real Interactions API early in this
project, so chat reuses it rather than guessing at a different one. The
one real difference: enrichment's `input` is a one-shot description of the
item, and it uses response_format to force structured JSON out. Chat has
no fixed schema to fill - `input` is the whole conversation transcript so
far plus the new message, and the reply is just text.
"""

import os

import httpx

from app.models import QueueItem

# Overridable so this can be pointed at a stub server for testing without
# touching the real endpoint - the default is the real one.
INTERACTIONS_URL = os.environ.get(
    "GEMINI_INTERACTIONS_URL", "https://generativelanguage.googleapis.com/v1beta/interactions"
)
API_REVISION = "2026-05-20"
DEFAULT_MODEL = "gemini-3.5-flash"


class ChatError(Exception):
    pass


def _api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise ChatError("GEMINI_API_KEY is not set")
    return key


def _note_context(item: QueueItem) -> str:
    lines = [f"Category: {item.category}"]
    if item.title:
        lines.append(f"Title: {item.title}")
    if item.body:
        lines.append(f"Body: {item.body}")
    if item.url:
        lines.append(f"URL: {item.url}")
    e = item.enrichment
    if e:
        lines.append(f"Enrichment kind: {e.kind}")
        if e.summary:
            lines.append(f"Summary: {e.summary}")
        if e.detail:
            lines.append(f"Detail: {e.detail}")
        if e.structured:
            lines.append(f"Structured data: {e.structured}")
    return "\n".join(lines)


def _transcript(item: QueueItem, new_message: str) -> str:
    lines = [f"{'User' if m.role == 'user' else 'Assistant'}: {m.text}" for m in item.chat]
    lines.append(f"User: {new_message}")
    return "\n\n".join(lines)


def send_message(item: QueueItem, message: str) -> str:
    model = os.environ.get("GEMINI_CHAT_MODEL", DEFAULT_MODEL)
    system_instruction = (
        "You are helping the user follow up on a personal note they captured "
        "and already had researched. Here is the note and what was found "
        "about it so far:\n\n" + _note_context(item) + "\n\n"
        "Answer follow-up questions directly and briefly, the way you'd "
        "answer a person, not write a report. Use the tools if the question "
        "needs something beyond what's already here."
    )
    payload = {
        "model": model,
        "input": _transcript(item, message),
        "system_instruction": system_instruction,
        "tools": [{"type": "google_search"}, {"type": "url_context"}],
        "store": False,
    }

    try:
        resp = httpx.post(
            INTERACTIONS_URL,
            json=payload,
            headers={
                "x-goog-api-key": _api_key(),
                "content-type": "application/json",
                "Api-Revision": API_REVISION,
            },
            timeout=60,
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise ChatError(f"request failed: {e}") from e

    data = resp.json()
    status = data.get("status")
    if status and status != "completed":
        raise ChatError(f"interaction status={status}")

    model_steps = [s for s in data.get("steps", []) if s.get("type") == "model_output"]
    if not model_steps:
        raise ChatError("no model_output step returned")

    text_parts = [c for c in model_steps[-1].get("content", []) if c.get("type") == "text"]
    if not text_parts or not text_parts[0].get("text", "").strip():
        raise ChatError("model_output step has no text content")

    return text_parts[0]["text"].strip()
