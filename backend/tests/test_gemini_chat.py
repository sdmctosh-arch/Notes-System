import httpx
import pytest

from app.gemini_chat import ChatError, send_message
from app.models import ChatMessage, Enrichment, QueueItem


def _item(**overrides):
    base = dict(
        queue_id="a",
        capture_id="a",
        category="lookup",
        title="Pier 66 laundry",
        body="Lookup if Pier 66 has laundry.",
        captured="2026-08-11T13:30:10-04:00",
        created="2026-08-11T13:30:10-04:00",
        status="enriched",
        enrichment=Enrichment(
            kind="answer",
            summary="Pier 66 has laundry.",
            detail="Pier 66 in Fort Lauderdale offers guest laundry.",
            citations=[],
            model="gemini-3.5-flash",
            enriched_at="2026-08-18T17:02:11-04:00",
        ),
        processor_version="0.2",
        chat=[],
    )
    base.update(overrides)
    return QueueItem(**base)


def _fake_response(text):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "status": "completed",
                "steps": [{"type": "model_output", "content": [{"type": "text", "text": text}]}],
            }

    return FakeResponse()


def test_send_message_raises_when_key_not_configured(monkeypatch):
    import app.gemini_chat as gemini_chat

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    called = {"n": 0}
    monkeypatch.setattr(gemini_chat.httpx, "post", lambda *a, **k: called.__setitem__("n", 1))

    with pytest.raises(ChatError):
        send_message(_item(), "any hours on weekends?")
    assert called["n"] == 0


def test_send_message_sends_context_and_transcript(monkeypatch):
    import app.gemini_chat as gemini_chat

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    captured = {}

    def fake_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return _fake_response("Yes, open until 8pm on weekends.")

    monkeypatch.setattr(gemini_chat.httpx, "post", fake_post)

    item = _item(chat=[ChatMessage(role="user", text="Any hours listed?", at="2026-08-19T10:00:00-04:00")])
    reply = send_message(item, "What about weekends specifically?")

    assert reply == "Yes, open until 8pm on weekends."
    assert captured["url"] == "https://generativelanguage.googleapis.com/v1beta/interactions"
    assert captured["headers"]["x-goog-api-key"] == "test-key"
    assert captured["headers"]["Api-Revision"] == "2026-05-20"
    assert captured["json"]["store"] is False
    assert captured["json"]["tools"] == [{"type": "google_search"}, {"type": "url_context"}]
    # prior turn and the new message both land in the transcript
    assert "Any hours listed?" in captured["json"]["input"]
    assert "What about weekends specifically?" in captured["json"]["input"]
    # note context goes in system_instruction, not the transcript
    assert "Pier 66 has laundry." in captured["json"]["system_instruction"]


def test_send_message_raises_on_incomplete_status(monkeypatch):
    import app.gemini_chat as gemini_chat

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"status": "incomplete", "steps": []}

    monkeypatch.setattr(gemini_chat.httpx, "post", lambda *a, **k: FakeResponse())

    with pytest.raises(ChatError):
        send_message(_item(), "hello")


def test_send_message_raises_on_network_error(monkeypatch):
    import app.gemini_chat as gemini_chat

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_post(*a, **k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(gemini_chat.httpx, "post", fake_post)

    with pytest.raises(ChatError):
        send_message(_item(), "hello")
