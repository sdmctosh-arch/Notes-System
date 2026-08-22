import httpx

from app.models import Enrichment, QueueItem
from app.seerr import push_media


def _media_item(**overrides):
    base = dict(
        queue_id="a",
        capture_id="a",
        category="media",
        title="Severance",
        body="Watch Severance.",
        media_type="tv",
        captured="2026-08-11T13:30:10-04:00",
        created="2026-08-11T13:30:10-04:00",
        status="enriched",
        enrichment=Enrichment(
            kind="media_info",
            summary="",
            detail="",
            citations=[],
            structured={"title": "Severance", "year": "2022", "media_type": "tv"},
            model="gemini-3.5-flash",
            enriched_at="2026-08-18T17:02:11-04:00",
        ),
        processor_version="0.2",
    )
    base.update(overrides)
    return QueueItem(**base)


def _search_response(results):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"results": results}

    return FakeResponse()


def test_push_media_skips_when_not_configured(monkeypatch):
    import app.seerr as seerr

    monkeypatch.delenv("SEERR_URL", raising=False)
    monkeypatch.delenv("SEERR_API_KEY", raising=False)

    called = {"n": 0}
    monkeypatch.setattr(seerr.httpx, "get", lambda *a, **k: called.__setitem__("n", 1))

    assert push_media(_media_item()) is False
    assert called["n"] == 0


def test_push_media_skips_a_task_or_other_media_type(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    called = {"n": 0}
    monkeypatch.setattr(seerr.httpx, "get", lambda *a, **k: called.__setitem__("n", 1))

    assert push_media(_media_item(media_type="game")) is False
    assert push_media(_media_item(media_type=None)) is False
    assert called["n"] == 0


def test_push_media_skips_without_a_year_from_enrichment(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    called = {"n": 0}
    monkeypatch.setattr(seerr.httpx, "get", lambda *a, **k: called.__setitem__("n", 1))

    assert push_media(_media_item(enrichment=None)) is False
    assert called["n"] == 0


def test_push_media_requests_the_year_matched_result(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    search_calls = {}
    request_calls = {}

    def fake_get(url, headers, timeout):
        search_calls["url"] = url
        search_calls["headers"] = headers
        return _search_response(
            [
                {"id": 111, "mediaType": "movie", "title": "Severance"},
                {"id": 222, "mediaType": "tv", "name": "Severance", "firstAirDate": "2019-01-01"},
                {"id": 333, "mediaType": "tv", "name": "Severance", "firstAirDate": "2022-02-18"},
            ]
        )

    class FakeRequestResponse:
        def raise_for_status(self):
            pass

    def fake_post(url, json, headers, timeout):
        request_calls["url"] = url
        request_calls["json"] = json
        request_calls["headers"] = headers
        return FakeRequestResponse()

    monkeypatch.setattr(seerr.httpx, "get", fake_get)
    monkeypatch.setattr(seerr.httpx, "post", fake_post)

    assert push_media(_media_item()) is True
    assert search_calls["url"] == "http://seerr.local:5055/api/v1/search?query=Severance"
    assert search_calls["headers"] == {"X-Api-Key": "secret-key"}
    # picks the tv result whose air year (2022) matches enrichment's year,
    # not the movie result or the tv result from the wrong year
    assert request_calls["url"] == "http://seerr.local:5055/api/v1/request"
    assert request_calls["json"] == {"mediaType": "tv", "mediaId": 333, "seasons": "all"}
    assert request_calls["headers"] == {"X-Api-Key": "secret-key"}


def test_push_media_url_encodes_a_space_as_percent20_not_plus(monkeypatch):
    # Regression test: httpx's params={...} dict encodes a space as "+"
    # (application/x-www-form-urlencoded), which a real Seerr instance's
    # strict query validator rejects with a 400 - "Parameter 'query' must
    # be url encoded. Its value may not contain reserved characters."
    # Confirmed 2026-08-22 against a live instance.
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    search_calls = {}

    def fake_get(url, headers, timeout):
        search_calls["url"] = url
        return _search_response([])

    monkeypatch.setattr(seerr.httpx, "get", fake_get)

    push_media(_media_item(title="American Gangster"))
    assert "American%20Gangster" in search_calls["url"]
    assert "+" not in search_calls["url"]


def test_push_media_requests_a_movie_without_seasons(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    request_calls = {}

    def fake_get(*a, **k):
        return _search_response([{"id": 42, "mediaType": "movie", "title": "Arrival", "releaseDate": "2016-11-11"}])

    def fake_post(url, json, headers, timeout):
        request_calls["json"] = json

        class FakeResponse:
            def raise_for_status(self):
                pass

        return FakeResponse()

    monkeypatch.setattr(seerr.httpx, "get", fake_get)
    monkeypatch.setattr(seerr.httpx, "post", fake_post)

    item = _media_item(
        title="Arrival",
        media_type="movie",
        enrichment=Enrichment(
            kind="media_info",
            summary="",
            detail="",
            citations=[],
            structured={"title": "Arrival", "year": "2016", "media_type": "movie"},
            model="gemini-3.5-flash",
            enriched_at="2026-08-18T17:02:11-04:00",
        ),
    )
    assert push_media(item) is True
    assert request_calls["json"] == {"mediaType": "movie", "mediaId": 42}


def test_push_media_skips_when_no_search_result_matches_the_year(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    monkeypatch.setattr(
        seerr.httpx,
        "get",
        lambda *a, **k: _search_response([{"id": 1, "mediaType": "tv", "firstAirDate": "1999-01-01"}]),
    )
    called = {"n": 0}
    monkeypatch.setattr(seerr.httpx, "post", lambda *a, **k: called.__setitem__("n", 1))

    assert push_media(_media_item()) is False
    assert called["n"] == 0


def test_push_media_swallows_search_network_errors(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    def fake_get(*a, **k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(seerr.httpx, "get", fake_get)

    assert push_media(_media_item()) is False


def test_push_media_swallows_request_http_error(monkeypatch):
    import app.seerr as seerr

    monkeypatch.setenv("SEERR_URL", "http://seerr.local:5055")
    monkeypatch.setenv("SEERR_API_KEY", "secret-key")

    monkeypatch.setattr(
        seerr.httpx,
        "get",
        lambda *a, **k: _search_response([{"id": 333, "mediaType": "tv", "firstAirDate": "2022-02-18"}]),
    )

    class FakeResponse:
        def raise_for_status(self):
            raise httpx.HTTPStatusError("403", request=None, response=None)

    monkeypatch.setattr(seerr.httpx, "post", lambda *a, **k: FakeResponse())

    assert push_media(_media_item()) is False
