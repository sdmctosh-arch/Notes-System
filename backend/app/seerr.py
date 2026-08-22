"""Best-effort push of a kept media note to a self-hosted Seerr instance.

Not literal notes - Seerr has nowhere to attach arbitrary text to a title
(its only free-text mechanism is the Issue/comment system, meant for
reporting playback problems, and it requires the media to already be known
to Seerr). Instead, "Keep in vault" on a movie/show note requests it in
Seerr, the same way push_recipe requests a kept recipe in Tandoor.

Built from Seerr's OpenAPI spec, not verified against a live instance -
watch the container logs after the first real "Keep in vault" on a media
item, the same as with Tandoor.

Matching: item.media_type (set at classification time, one of the
schema-enforced tv/movie/game/music/other - see classify-prompt.md) decides
whether there's anything to request at all, and is far more reliable than
enrichment's free-text structured.media_type. Seerr's own /search is TMDB-
backed, so searching it by title already carries TMDB's matching - the only
extra guard needed is requiring the search result's release/air year to
match what enrichment found. No year (enrichment hasn't run, or found
media_info but no reliable year) or no matching year among the results
means skip rather than guess wrong and request the wrong title.

Every failure mode here is swallowed rather than raised, exactly like
push_recipe - nothing in main.py branches on this function's return value;
it exists only for logging and tests.
"""

import logging
import os
import urllib.parse

import httpx

from app.models import QueueItem

logger = logging.getLogger(__name__)


def _config() -> tuple[str, str]:
    url = os.environ.get("SEERR_URL", "").rstrip("/")
    api_key = os.environ.get("SEERR_API_KEY", "")
    return url, api_key


def _year_of(date_str: str | None) -> str | None:
    if not date_str or len(date_str) < 4:
        return None
    return date_str[:4]


def _find_match(results: list[dict], media_type: str, year: str) -> dict | None:
    date_field = "releaseDate" if media_type == "movie" else "firstAirDate"
    for result in results:
        if result.get("mediaType") != media_type:
            continue
        if _year_of(result.get(date_field)) == year:
            return result
    return None


def push_media(item: QueueItem) -> bool:
    url, api_key = _config()
    if not url or not api_key:
        logger.info(
            "Seerr not configured (SEERR_URL/SEERR_API_KEY unset) - skipping push for %s",
            item.queue_id,
        )
        return False

    media_type = item.media_type
    if media_type not in ("movie", "tv"):
        logger.info(
            "%s has media_type=%r, not movie or tv - nothing to request in Seerr",
            item.queue_id,
            media_type,
        )
        return False

    if not item.title:
        logger.info("%s has no title to search Seerr with - skipping push", item.queue_id)
        return False

    structured = (item.enrichment.structured if item.enrichment else None) or {}
    year = str(structured.get("year")) if structured.get("year") else None
    if not year:
        logger.info(
            "%s has no confirmed year from enrichment yet - skipping push rather than guessing",
            item.queue_id,
        )
        return False

    headers = {"X-Api-Key": api_key}
    # Not httpx's params={...} - it percent-encodes a space as "+" (the
    # application/x-www-form-urlencoded convention), which Seerr's strict
    # query validator rejects outright ("Parameter 'query' must be url
    # encoded. Its value may not contain reserved characters.") since it
    # only accepts %20. urllib.parse.quote defaults to %20 for a space.
    encoded_query = urllib.parse.quote(item.title, safe="")
    try:
        resp = httpx.get(
            f"{url}/api/v1/search?query={encoded_query}", headers=headers, timeout=15
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
    except Exception:
        logger.exception("Seerr search failed for %s - skipping push", item.queue_id)
        return False

    match = _find_match(results, media_type, year)
    if match is None:
        logger.info(
            "No Seerr search result for %r (%s, %s) matches on year - skipping push",
            item.title,
            media_type,
            year,
        )
        return False

    payload = {"mediaType": media_type, "mediaId": match["id"]}
    if media_type == "tv":
        payload["seasons"] = "all"

    try:
        resp = httpx.post(f"{url}/api/v1/request", json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        logger.info("Requested %r (%s) in Seerr for %s", item.title, media_type, item.queue_id)
        return True
    except Exception:
        logger.exception("Failed to request %r in Seerr for %s - continuing anyway", item.title, item.queue_id)
        return False
