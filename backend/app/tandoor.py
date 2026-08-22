"""Best-effort push of a kept recipe to a self-hosted Tandoor instance.

Verified 2026-08-21 against a live Tandoor instance (vabene1111/recipes),
including reading its actual server source
(cookbook/views/api.py::RecipeUrlImportView). Two calls are required, not
one: POST to /api/recipe-from-source/ only parses the HTML we send and
returns a preview - it never saves anything (there is no .save() or
.objects.create() in the branch that handles a raw "data" payload, only
in the separate Tandoor-to-Tandoor share-link branch). It returns 200
with a fully-formed recipe body either way, so a naive caller that stops
after that request sees what looks like success while nothing lands in
Tandoor. Tandoor's own frontend takes that parsed "recipe" object and
POSTs it to /api/recipe/ (the real RecipeViewSet) to actually create it -
this module does the same. The "Bearer <token>" auth header was
confirmed against the live instance too. The parsed object needs two
fields filled in first that the parse step leaves null for the frontend
to ask the user about - see _fill_required_fields.

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


def _fill_required_fields(parsed_recipe: dict) -> None:
    # The parse call leaves these null for the frontend to fill in after
    # the user reviews the preview - /api/recipe/'s serializer rejects
    # both as null (confirmed against a live instance: "This field may not
    # be null" for each ingredient's order and for top-level servings).
    # There's no user in this flow to ask, so pick values that create a
    # valid recipe rather than losing the push over missing metadata.
    if not parsed_recipe.get("servings"):
        parsed_recipe["servings"] = 1
    for step in parsed_recipe.get("steps", []):
        for index, ingredient in enumerate(step.get("ingredients", [])):
            if ingredient.get("order") is None:
                ingredient["order"] = index


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
    headers = {"Authorization": f"Bearer {token}"}

    try:
        parse_resp = httpx.post(
            f"{url}/api/recipe-from-source/",
            json={"url": item.url or "", "data": html},
            headers=headers,
            timeout=15,
        )
        parse_resp.raise_for_status()
        parsed_recipe = parse_resp.json().get("recipe")
        if not parsed_recipe:
            logger.warning(
                "Tandoor recipe-from-source returned no recipe for %s: %s",
                item.queue_id,
                parse_resp.text[:200],
            )
            return False
        _fill_required_fields(parsed_recipe)

        # The parse call above never persists anything - see module
        # docstring. This second call is the one that actually creates the
        # recipe in Tandoor.
        create_resp = httpx.post(
            f"{url}/api/recipe/",
            json=parsed_recipe,
            headers=headers,
            timeout=15,
        )
        create_resp.raise_for_status()
        logger.info("Pushed recipe %s to Tandoor: %s", item.queue_id, create_resp.text[:200])
        return True
    except Exception:
        logger.exception("Failed to push recipe %s to Tandoor - continuing anyway", item.queue_id)
        return False
