# Changelog

Every entry here corresponds to one merged pull request into `main`. New
entries are appended automatically by `.github/workflows/changelog.yml` when
a PR merges - see that workflow for how.

## 2026-08-20 - Archive/Vault views, search, Tandoor push, and a batch of small UX fixes (#6)

### Summary

A batch of feature requests worked through overnight, per a punch list with decisions confirmed in advance. Seven commits:

- **Archive view** (PROJECT.md 10.4) — spec'd since Stage 3 but never built. Read-only view of archived/filed/dismissed items, with a search field, a new `GET /api/archive` endpoint. Item detail now hides Edit/action-bar controls for anything in a final status.
- **Vault view** — not spec'd, but there was no way to see the Markdown files "Keep in vault" produces. Read-only browser grouped by category folder. Deliberately scoped to only the known category folders (Recipes/Projects/Ideas/Unclassified) rather than a full walk of `VAULT_DIR`, since that directory is the user's entire real notes vault, not something this system owns.
- **Search** — a single `GET /api/search` spanning Inbox, Archive, and vault notes (title/body/enrichment text), with a debounced Search page linking straight to results.
- **Tandoor recipe push** — "Keep in vault" on a recipe now also pushes the schema.org/Recipe data to a self-hosted Tandoor instance via `TANDOOR_URL`/`TANDOOR_API_TOKEN` (optional, no-op if unset). Best-effort only - a Tandoor outage or API mismatch never blocks filing the note. **Flagged as unverified against a live Tandoor instance** - Tandoor's docs site was network-blocked from the dev sandbox, so the request shape is built from public GitHub issues/discussions rather than confirmed docs. Verified our own request-building against a stub HTTP server; the container logs will show Tandoor's actual response for debugging once tested for real.
- **YouTube embeds now use `youtube-nocookie.com`, the original captured URL is always shown on item detail even when citations come back empty** (e.g. a Reddit thread the fetch tool couldn't access - previously the URL disappeared entirely in that case), **and Inbox/Archive scroll position is preserved when navigating back from an item** - three small fixes in one commit.
- **CHANGELOG.md**, backfilled with all prior merged PRs, with a GitHub Action that appends an entry automatically on every future merge to main.
- **Task Scheduler window visibility** documented in PROJECT.md 8.4 (config/docs only - couldn't be tested against a real Windows Task Scheduler from this environment).

### Test plan

- [x] Backend: `pytest` - 52 passed (up from 21: +9 Archive, +8 Vault, +6 Search, +8 Tandoor)
- [x] Frontend: `npm test` (Vitest) - 34 passed (up from 19)
- [x] Frontend production build (`vite build`) still succeeds
- [x] `docker compose config` validates the new optional Tandoor env vars
- [x] Manual Playwright passes against a sandboxed backend for: Archive (list/search/read-only detail/back-nav), Vault (list/read/folder-scoping/path-traversal rejection), Search (inbox + vault + archive results, no-match state), scroll restoration, YouTube nocookie src, and the Reddit-style original-URL fallback
- [x] Tandoor push verified end-to-end against a stub HTTP server standing in for a real Tandoor instance: confirmed request path/auth header/JSON-LD payload, and confirmed "Keep in vault" still succeeds when Tandoor is completely unreachable

## 2026-08-20 - Post-Stage-4 audit fixes: edit UI, validation, CI, tests, container hardening (#5)

- Added a logout control to the Inbox header (`/api/logout` existed but had no UI entry point).
- Added a combined category/title/body edit view, reachable from item detail.
- Constrained `PATCH` category updates to the known category keys (422 on an unknown value).
- Removed a stale `test-corpus/baseline.txt` reference from CLAUDE.md.
- Added an unauthenticated `/api/health` endpoint and a `docker-compose.yml` healthcheck.
- Pinned the Dockerfile's base images to specific versions instead of floating tags.
- Added GitHub Actions CI running the backend pytest suite on every push/PR to main.
- Added Vitest + React Testing Library frontend smoke tests (19 tests).

## 2026-08-20 - Add password authentication and session management (#4)

- Added bcrypt password verification and signed session cookies (itsdangerous), 30-day expiry.
- Protected all `/api/items/*` routes with a `require_auth` dependency.
- Added `/api/login` and `/api/logout` endpoints and a frontend Login screen.
- Added the Dockerfile and `docker-compose.yml` for the production container.
- Wired FastAPI to serve the built React frontend alongside the API from one origin.

## 2026-08-19 - Add Stage 3 React frontend (Inbox + item detail) (#3)

- Built the Inbox (category filter chips, empty state, dark mode) and item detail pages in React + Tailwind, ported from the approved Warm Editorial design.
- Item detail renders by `enrichment.kind` - recipe ingredients/steps, media info, or a summary/detail/citations card with a real YouTube embed.
- Fixed a routing collision between the API and the SPA's own `/items/{id}` route by namespacing the API under `/api`.

## 2026-08-19 - Add FastAPI backend with queue item management and vault integration (#2)

- Added the FastAPI service: list/get/update items, and move them between pending and archived.
- Added atomic, temp-file-then-rename writes for all queue JSON.
- Added the vault note writer, mapping categories to vault folders and generating Markdown with frontmatter.
- Added the initial pytest suite (14 tests) against a sandboxed queue/vault tree.

## 2026-08-19 - Add enrichment pipeline for non-task items before queuing (#1)

- Added the `Invoke-Enrichment` step to the PowerShell processor: a second Gemini call that researches, answers, summarizes, or converts an item based on its category, using `google_search` and `url_context` tools.
- Non-task items (lookup, project, recipe, idea, media, reference, unclassified) are now queued with an `enrichment` field; task items (todo, grocery) are queued as-is.
- Enrichment failures are graceful - an item lands in the queue with `status: enrich_failed` rather than blocking the whole capture.
