"""Best-effort push of a kept recipe to a self-hosted Tandoor instance.

Built from Tandoor's public API docs and community reports (recipe-from-
source accepts a schema.org/Recipe JSON-LD blob via its "data" field, the
same way pasting a URL for it to scrape does) - NOT verified against a
live Tandoor instance, since this environment has no network access to
one. The endpoint path, payload shape, and "Bearer <token>" auth header
are the best-supported guess, not a confirmed contract. Watch the
container logs after the first "Keep in vault" on a real recipe; if
Tandoor rejects the request, the log line below will show its response
body, which is the fastest way to see what needs adjusting.

Every failure mode here is swallowed rather than raised - a Tandoor
outage, a wrong token, or an API mismatch must never block filing the
note itself. That's why nothing in main.py branches on this function's
return value; it exists only for logging and tests.
"""

import json
import logging
import os

import httpx

from app.models import QueueItem

logger = logging.getLogger(__name__)

_RECIPE_FIELDS = (
    "description",
    "recipeIngredient",
    "recipeInstructions",
    "recipeYield",
    "prepTime",
    "cookTime",
    "totalTime",
    "recipeCategory",
    "recipeCuisine",
)


def _config() -> tuple[str, str]:
    url = os.environ.get("TANDOOR_URL", "").rstrip("/")
    token = os.environ.get("TANDOOR_API_TOKEN", "")
    return url, token


def _schema_org_recipe(item: QueueItem) -> dict:
    structured = (item.enrichment.structured if item.enrichment else None) or {}
    recipe = {
        "@context": "https://schema.org/",
        "@type": "Recipe",
        "name": structured.get("name") or item.title or item.capture_id,
    }
    for key in _RECIPE_FIELDS:
        value = structured.get(key)
        if value:
            recipe[key] = value
    if item.url:
        recipe["url"] = item.url
    return recipe


def push_recipe(item: QueueItem) -> bool:
    url, token = _config()
    if not url or not token:
        logger.info(
            "Tandoor not configured (TANDOOR_URL/TANDOOR_API_TOKEN unset) - skipping push for %s",
            item.queue_id,
        )
        return False

    recipe = _schema_org_recipe(item)
    # recipe-from-source expects HTML it can scrape a JSON-LD block out of -
    # this wraps the schema.org data we already generated the same way a
    # real recipe page would embed it, so the same code path used for a
    # normal URL import handles ours too.
    html = f'<html><head><script type="application/ld+json">{json.dumps(recipe)}</script></head><body></body></html>'

    try:
        resp = httpx.post(
            f"{url}/api/recipe-from-source/",
            json={"url": item.url or "", "data": html},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        resp.raise_for_status()
        logger.info("Pushed recipe %s to Tandoor: %s", item.queue_id, resp.text[:200])
        return True
    except Exception:
        logger.exception("Failed to push recipe %s to Tandoor - continuing anyway", item.queue_id)
        return False
