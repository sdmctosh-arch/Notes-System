# Changelog

Every entry here corresponds to one merged pull request into `main`. New
entries are appended automatically by `.github/workflows/changelog.yml` when
a PR merges - see that workflow for how.

## 2026-08-22 - Add SteamGridDB cover/hero lookup for game media items (#17)

### Summary
- TMDB has no game catalog, so a `game` media item's `structured.image`/`structured.backdrop` were always `null` - `Get-TmdbArt` skips `game`/`music` by design.
- New `Get-SteamGridDbArt` fills that gap for `game`: cover art via SteamGridDB's `grids` endpoint, a wide banner via `heroes`, into the same `structured.image`/`structured.backdrop` fields the frontend already renders generically (no frontend changes needed).
- Same optional, best-effort posture as TMDB/Tandoor/Seerr: no key configured, no search match, or an API error just means no image, never a failed item. `$env:STEAMGRIDDB_API_KEY` or a `steamgriddb.key.xml` DPAPI file, same pattern as `tmdb.key.xml`/`gemini.key.xml`.
- Deliberately **no year-match guard**, unlike TMDB - SteamGridDB's search doesn't return a release date, and fetching one would mean a per-candidate lookup call. Trusts the top autocomplete result instead, the same "good enough" bar already accepted for a recipe's photo.
- A SteamGridDB-returned URL is still validated with the existing URL-safety rule (9.4) before being stored, since it comes straight from an external response rather than being built by this script (unlike TMDB's URLs).
- `docs/PROJECT.md` updated in the same PR (2.4, 9.2, 9.4, 10.4, 10.5, 14).

### Setup required
Game cover/hero images need `STEAMGRIDDB_API_KEY` (env var) or a DPAPI `steamgriddb.key.xml` on the processor machine - optional, nothing breaks without it.

### Test plan
- [x] `pwsh` parse check - no syntax errors
- [x] Standalone unit tests for `Get-SteamGridDbArt` (no key, non-game skip, full success path, no search match, partial API failure tolerated, invalid URL dropped) - all pass
- [ ] Not exercised against the live SteamGridDB API yet - verify after this merges and a key is configured

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-22 - Fix re-enrich dropping media_type, silently skipping TMDB image lookup (#16)

### Summary
- `Invoke-ReenrichRequests` builds a synthetic item with only `category`/`title`/`body`/`url` before redoing pass 2. `Get-TmdbArt` (added in #15) needs `media_type` to decide `movie` vs `tv` vs skip (`game`/`music`) - without it, re-enriching an old `media` item silently never got a poster/backdrop.
- Recipe images were unaffected - the model finds those itself using fields already present in the synthetic item.
- Carries `media_type` through; `docs/PROJECT.md` 10.5 updated to match.

### Test plan
- [x] `pwsh` parse check - no syntax errors
- [ ] Not exercised against a live re-enrich of a real media item yet - verify after this merges

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-22 - Wire real images into recipe and media items (#15)

### Summary
- Recipe items now get a dish photo the enrichment call finds itself, using its existing `google_search`/`url_context` tools - preferring the source page's image, falling back to a similar recipe online for the same dish. Validated with the same URL rule as the top-level `url` field (9.4); an invalid result is dropped to `null`, not stored.
- Media items now get a poster/backdrop looked up directly against the TMDB API (`Get-TmdbArt`), using the title/year enrichment already confirmed and the classifier's schema-enforced `media_type` (skips `game`/`music`, same as the existing Seerr push). Optional and best-effort, same posture as Tandoor/Seerr - no key configured, no year, or no match just means no image.
- Both are stored as plain URLs and hotlinked by the frontend (`ArtImage.jsx`), which falls back to the existing striped placeholder when there's no URL or the image fails to load.
- `docs/PROJECT.md` (2.4, 9.2, 9.3, 9.4, 10.4, 14) updated in the same PR per CLAUDE.md rule 8.

### Setup required
Media images need `TMDB_API_KEY` (env var) or a DPAPI `tmdb.key.xml` (same pattern as `gemini.key.xml`) on the processor machine - it's optional, so nothing breaks without it, media items just keep the placeholder. Recipe images need no new credential.

### Test plan
- [x] `pwsh` parse check on `Invoke-NoteProcessor-v2.ps1` - no syntax errors
- [x] Standalone unit tests for `Get-TmdbArt`/`Test-CleanUrl` integration (no key, game/music skip, year match/no-match, invalid image URL dropped, `$null` art guarded under strict mode) - all pass
- [x] Frontend: `npx vitest run` - 99/99 passed, including new coverage for real-image rendering and image-load-failure fallback in `InboxRow` and `ItemDetail`
- [ ] Not exercised against a live TMDB API or a live recipe-image search - verify after the first real capture of each kind, same as the Seerr/Tandoor pushes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-21 - Fix Tandoor push: recipe-from-source only parses, never saves

### Summary

Committed directly to `main` rather than through a PR, so the automated
changelog workflow (`.github/workflows/changelog.yml`) never fired - added
by hand instead. Going forward, changes are routed through a branch and PR
so that automation keeps working without manual entries like this one.

- **Root cause**: "Keep in vault" on a recipe looked like it worked - Tandoor
  returned `200 OK` with a fully parsed recipe body - but nothing ever
  appeared in Tandoor. Reading Tandoor's actual server source
  (`cookbook/views/api.py::RecipeUrlImportView`) showed why:
  `/api/recipe-from-source/` only scrapes and previews a recipe; there's no
  `.save()` in the code path that handles a raw HTML payload. Tandoor's own
  frontend takes that parsed object and POSTs it to `/api/recipe/` to
  actually persist it.
- **Fix** (`backend/app/tandoor.py`): `push_recipe` now makes both calls,
  and fills in `servings` and each ingredient's `order` before the create
  call - Tandoor's real serializer rejects both as null, but the parse step
  always returns them null (there's no user in this flow to ask, unlike
  Tandoor's own UI).
- A separate, unrelated issue surfaced during diagnosis: `TANDOOR_URL`
  pointed at a host:port where a different local app (Tunarr) had also
  bound port 8000, so the push was silently hitting the wrong server. No
  code change - resolved by moving the conflicting process off that port.
- `docs/PROJECT.md` (9.3) and `.env.example` updated in the same change,
  per CLAUDE.md's rule to keep the spec in sync.

### Test plan

- [x] Backend: `pytest tests/test_tandoor.py -v` - 7 passed, including new
      coverage for the two-call contract and the required-field fill-in
- [x] Verified end-to-end against a live self-hosted Tandoor instance -
      confirmed `201 Created` and a real recipe row, not just a `200` parse
      response
- [x] Rebuilt and redeployed the `notes-interface` container; confirmed the
      running image contains the fix

## 2026-08-21 - Replace star with Pin; add welcome header, drawer nav, desktop split view, and per-category art placeholders (#14)

### Summary

Implements the approved Turn 1 design scope from the Claude Design mockup import:

- **Pinned** replaces the important/star toggle outright — backend (`pinned` field, `PATCH /api/items/{id}/pin`) and frontend (`PinIcon`, `api.setPinned`), with matching test/doc updates. `StarIcon.jsx` is deleted.
- **Welcome header** — a time-of-day greeting ("Good morning/afternoon/evening", computed client-side, no stored name) with a new/total note count, and Pinned/To review grouping in the Inbox list.
- **Hamburger drawer nav** — the mobile Inbox's row of nav icons is replaced by a slide-in drawer (Inbox/Lists/Vault/Archive, dark-mode switch, log out) plus a floating "+" for New note. `LogoutButton.jsx` and `ThemeToggle.jsx` are deleted since the drawer absorbed their behavior and nothing else used them.
- **Desktop two-pane split view** — at 1024px+ the Inbox becomes an icon rail + list pane + detail pane layout (`DesktopRail.jsx`, `useIsDesktop.js`). Selecting a row doesn't navigate — it just changes which item the detail pane shows (`ItemDetail`'s new `id`/`embedded` props) — so the list stays visible. Every other view (Archive, Vault, Search) is unchanged on both desktop and mobile.
- **Per-category art placeholders** — `media` and `recipe` items get a labelled striped placeholder slot (`ArtPlaceholder.jsx`) instead of the category badge: a 2:3 "poster" / 1:1 "dish" thumbnail in the list, and a 16:9 backdrop (media) / 4:3 inset (recipe) in the detail view, standing in until a real image source is wired up.

`docs/PROJECT.md` is updated in this PR for all of the above (§10.4, §10.5, §14), per CLAUDE.md's rule to keep the spec in sync with the change.

### Test plan

- [x] Backend: `pytest -q` — 99 passed
- [x] Frontend: `npm test -- --run` — 94 passed (18 test files, including new coverage for the pin rename, desktop split view, and art placeholders)
- [x] `npm run lint` — no new warnings
- [x] Manual Playwright verification against a sandboxed backend/frontend (mobile Inbox with greeting/pinned grouping/drawer, desktop two-pane split view, media/recipe art placeholders in light and dark mode) — screenshots reviewed with the user during the session

https://claude.ai/code/session_01HqRne1xcpbgJit6UrdXkcu

## 2026-08-21 - Add Unarchive and a Share button (#13)

### Summary

- **Unarchive**: `POST /api/items/{id}/unarchive` moves an `archived` or `dismissed` item back to `queue/pending/`, recomputing `status` (`enriched` if the item has enrichment, else `pending`). `captured` is left untouched, so the item returns to the Inbox at its real age rather than looking freshly captured - confirmed in testing that an 11-day-old restored item correctly shows "Stale," not "New."
  - `filed` items are permanent from this button and 409 if you try. "Keep in vault" already wrote a real Markdown file to the vault (and possibly pushed to Tandoor or Seerr), neither of which this can safely reverse.
  - Archive was previously fully read-only (PROJECT.md 10.4); this is the one exception, and only for the two outcomes with no side effects to undo.
- **Share**: a share icon on every item, active or archived - client-only, no backend request at all. Uses the Web Share API (`navigator.share`) to hand the item's title, summary (or body if unenriched), and original URL to another app on the phone. Falls back to copying the same text to the clipboard when the browser has no share sheet, or when the share target rejects for a reason other than the user cancelling.
- `docs/PROJECT.md` updated in the same commit (10.4, 10.5, and 14).

Both features were scoped with the user upfront given real design forks: Unarchive's exclusion of `filed` items (side effects can't be cleanly undone) and keeping the restored item's real `captured` timestamp rather than resetting it; Share's behavior given this is a single-user, VPN-only app where a "shareable link" wouldn't mean anything to send to someone else.

### A real bug found and fixed along the way

While testing the Share button's clipboard fallback, `@testing-library/user-event`'s `setup()` turned out to reset `navigator.clipboard` internally - stubbing it *before* `userEvent.setup()` silently gets clobbered, so the stub has to be set up *after*. Cost some debugging (jsdom actually implements a real, non-trivial Clipboard API these days, which is what made this so confusing at first) but is now the working pattern in `ShareButton.test.jsx`.

### Test plan

- Backend: 99 tests passing, including 7 new `test_api.py` tests for Unarchive (archived → pending recomputes to `enriched`, dismissed → pending, no-enrichment recomputes to `pending`, filed is 409 and stays untouched, a never-archived item is 409, missing item is 404, auth required).
- Frontend: 82 tests passing, including new `UnarchiveBar.test.jsx`, `ShareButton.test.jsx`, and `shareText.test.js`, plus `ItemDetail.test.jsx` coverage confirming Unarchive shows for archived/dismissed but not filed or active items, and Share shows in both the active and archived states. Production `vite build` is clean.
- End-to-end: verified against a running sandboxed stack (fake data, isolated queue dirs) via Playwright - unarchiving a dismissed item and confirming it lands back in the Inbox showing "Stale" (real age preserved), and the Share button's clipboard-fallback confirmation state (headless Chromium has no native share sheet to screenshot, so the fallback path is what's visually verified).

## 2026-08-21 - Add Seerr auto-request for kept movie/TV notes (#12)

### Summary

- "Keep in vault" on a `media` note whose classified `media_type` is `movie` or `tv` now requests it in a self-hosted Seerr instance - the same best-effort, never-blocks-filing pattern already used for the Tandoor recipe push.
- Not literal notes: Seerr has nowhere to attach arbitrary text to a title. Its only free-text mechanism is the Issue/comment system, which is meant for reporting playback problems and requires the media to already exist in Seerr's own DB (a `mediaId` from an internal `MediaInfo` row, not a bare TMDB id) - a poor fit for a personal "watch this" note, and it would show up in Seerr's admin Issues panel as if reporting a real problem. Requesting the title is the honest equivalent of what a person would do themselves.
- Matches by searching Seerr's `/search` endpoint (TMDB-backed) by title, filtering to the right media type, and requiring the result's release/air year to match what enrichment found (`enrichment.structured.year`). No year, or no result in that year, means it skips rather than guessing and requesting the wrong title into your Radarr/Sonarr queue.
- Uses the classifier's schema-enforced `item.media_type` (`tv`/`movie`/`game`/`music`/`other`, set at classification time - see `classify-prompt.md`) rather than enrichment's free-text `structured.media_type`, since it's the more reliable signal and is always present for a `media` item regardless of whether enrichment succeeded.
- New `SEERR_URL`/`SEERR_API_KEY` env vars, wired into `docker-compose.yml` and documented in `.env.example` the same way as the existing `TANDOOR_URL`/`TANDOOR_API_TOKEN`. Leaving both unset skips the push entirely.
- `docs/PROJECT.md` updated in the same commit (9.2 documents the push and its matching rule; 14's summary mentions it alongside the Tandoor push).

Like the Tandoor integration, this is built from Seerr's public OpenAPI spec, not verified against a live instance - worth checking the container logs after the first real "Keep in vault" on a movie or show.

### Test plan

- Backend: 92 tests passing, including 10 new `test_seerr.py` tests (not configured, non-movie/tv media types skipped without a call, no year from enrichment skipped, correct year-matched result picked over a wrong-year or wrong-media-type result, movie request omits `seasons` while TV requests `seasons: "all"`, no year-matched search result skips, and that both a search failure and a request failure are swallowed) plus 2 new `test_api.py` tests verifying `move_item`'s "keep" wiring (a failed Seerr push still succeeds in filing the note, and a non-`media` category never calls Seerr).
- `docker compose config` validates cleanly with the new env vars wired through.
- Frontend is untouched - this is a fully automatic backend push with no new UI surface, so the existing 67 frontend tests are unaffected.

## 2026-08-21 - Add New/Stale labels, important flag, re-enrich, and New note (#11)

### Summary

Four features, built and verified one at a time (each with its own commit):

- **"New" / "Stale" labels** - a card/detail label computed client-side from the item's existing `captured` timestamp: "New" for the first 24 hours, "Stale" once 7 days pass with no decision. No backend change - see `frontend/src/itemLabels.js`.
- **Flag as important** - a star toggle on item detail, pending-only like every other mutation. New `PATCH /api/items/{id}/important` endpoint and `important` field on the queue item; the star still shows read-only once an item is archived/filed.
- **Re-enrich** - implements the request-file mechanism PROJECT.md 10.5 already specified but neither side had built. The interface writes an empty `<queue_id>.reenrich` marker into `queue/pending/` (a documented exception to "the processor creates files there," alongside chat's exception to "the interface doesn't call Gemini"). The processor's new `Invoke-ReenrichRequests` (in `Invoke-NoteProcessor-v2.ps1`) scans for markers every run, redoes enrichment, and removes the marker either way - a failed retry leaves the item completely unchanged rather than wiping a working enrichment.
- **New note** - a "+" on the Inbox header opens a form (category, optional title, body) and `POST /api/items` writes a queue item straight into `queue/pending/`, skipping classification since the user already picked the category. Marked `manual: true` (no real capture file behind it, so "View original capture" is hidden). For any enrichable category, creation also drops a `.reenrich` marker, reusing the mechanism above, so the note gets enriched on the processor's next run.

`docs/PROJECT.md` is updated in the same commit as each change per CLAUDE.md's rule 8 (10.4, 10.5, 10.6, and 14 all touched).

### A real bug found and fixed along the way

While verifying re-enrich's processor-side atomic write in a pwsh sandbox, `[IO.File]::Replace($tmp, $target, $null)` threw `"The value cannot be an empty string (Parameter 'path')"` on this platform, even though `$null` is meant to mean "no backup file." Switched to `Move-Item -Force`, which is atomic (same-directory rename) and actually works here. Documented in CLAUDE.md's PowerShell notes so it isn't rediscovered.

### Test plan

- Backend: 82 tests passing (`test_api.py` covers the important/reenrich/create-item endpoints: happy path, 404s for missing/archived items, auth requirement, category validation, and that a task category like `todo` never gets a re-enrich marker).
- Frontend: 67 tests passing (`itemLabels.test.js`, `ItemDetail.test.jsx`, `Inbox.test.jsx`, `ReenrichButton.test.jsx`, `NewItem.test.jsx`). Production `vite build` is clean.
- Processor: `Invoke-NoteProcessor-v2.ps1` verified end-to-end in a pwsh sandbox against a local stub standing in for the Interactions API (via a new `GEMINI_INTERACTIONS_URL` override, mirroring the interface's existing one) - success, an orphaned marker, `-DryRun`, a task-category item (dropped without a call), and a network failure (item left unchanged) all behave as designed.
- End-to-end: each feature verified against a running sandboxed stack (fake data, isolated queue/vault dirs) via Playwright, including visual confirmation via screenshots - the star toggle in both states, the re-enrich button and its confirmation, and the full New note flow from form to item detail to Inbox listing.

## 2026-08-20 - Add live follow-up chat on item detail (#10)

### Summary

- Adds a live "Follow up" chat panel to the item detail page, using the note (title/body/enrichment) as context so the user can continue the conversation after enrichment.
- This is the one deliberate exception to the "interface never calls Gemini" rule (PROJECT.md 3.3): a live conversation needs a synchronous reply, which the processor's every-5-minute file-based pipeline can't give. Classification and enrichment stay processor-only and file-based, unchanged.
- New backend module `backend/app/gemini_chat.py` calls the Gemini Interactions API directly, mirroring the request/response shape already verified in `Invoke-Enrichment` (`scripts/Invoke-NoteProcessor-v2.ps1`) rather than guessing at it: same endpoint, headers, and response parsing, but with a full conversation transcript as `input` and no `response_format` (chat replies are plain text, not structured).
- Chat history persists into the item's own JSON as a new `chat` field (same atomic-write pattern used everywhere else - no new persistence mechanism, no database).
- Chat is pending-only, matching the existing move/edit restriction - archived and dismissed items are read-only, so the chat panel doesn't render for them.
- Requires a new `GEMINI_API_KEY` env var for the interface container. The DPAPI-encrypted `gemini.key.xml` used by the Windows processor only decrypts for one Windows user on one machine, so the Linux container needs its own plaintext key, handled the same way as `PASSWORD_HASH`/`TANDOOR_API_TOKEN` (documented in `.env.example`, wired through `docker-compose.yml`). Leaving it unset fails chat requests with a clear error and doesn't affect anything else.
- `docs/PROJECT.md` updated in this PR per CLAUDE.md rule 8: 3.3 documents the exception, 10.4 documents the Chat view, 14's summary is updated.

### Test plan

- Backend: 68 tests passing, including 4 new `test_gemini_chat.py` tests (missing key, request shape/headers/transcript/context, incomplete status, network error) and 6 new `test_api.py` tests covering the `/api/items/{id}/chat` endpoint (append, accumulate across messages, 404 for missing/archived items, 502 on Gemini failure, auth requirement).
- Frontend: 47 tests passing, including 4 new `ChatPanel.test.jsx` tests (renders history, sends and applies the response, disables Send for whitespace-only input, shows error and preserves the draft on failure) plus updates to `ItemDetail.test.jsx` confirming the panel is hidden for archived items and shown for active ones. Production `vite build` is clean.
- End-to-end: verified against a running sandboxed stack with a local stub standing in for the real Gemini endpoint (via a new `GEMINI_INTERACTIONS_URL` override, default unchanged) - login, open an item, send a follow-up, confirm the reply renders, reload and confirm the chat persisted, archive the item, confirm the chat panel disappears. Manually inspected the stub's captured request to confirm the real auth header, `Api-Revision`, `tools`, `store: false`, and injected note context/transcript are all correct.

## 2026-08-20 - Require PROJECT.md updates per PR; fix Node version pin (#9)

### Summary

- **CLAUDE.md rule 8**: require `docs/PROJECT.md` to be updated in the same PR as the change it affects, so it stops drifting the way it did before. Noted explicitly that this can't be automated the way CHANGELOG.md is — appending a PR summary needs no understanding of the change, but correcting PROJECT.md's specific claims does.
- **Dockerfile fix**: bumped the frontend build stage's Node image from `22.11.0` to `22.22.2`. The old pin (from an earlier commit) was older than several dependencies' declared engine requirements (`@asamuzakjp/css-color`, `@vitejs/plugin-react`, `whatwg-url`, and others need `>=22.13.0` or `>=24.0.0`), producing `EBADENGINE` warnings on every `npm ci`. Harmless on its own since npm doesn't block installs over engine mismatches by default, but no reason to leave it wrong. `22.22.2` is a version already proven to work against this exact `package.json`.

### Test plan

- [x] `docker compose config` still validates cleanly with the new image tag
- [x] Confirmed no other stale references to the old Node version elsewhere in the repo
- [x] Backend/frontend test suites unaffected by either change (doc-only + base image bump)

## 2026-08-20 - Fix PROJECT.md drift, build Lists and Capture views (#8)

### Summary

Reviewed PROJECT.md and CLAUDE.md against the actual code for incorrectness and inconsistency. CLAUDE.md held up; PROJECT.md had drifted significantly since it was written pre-Stage-1.

**Doc fixes:**
- Status headers and the "current state" table said things like "to build" and "not started" for the processor and interface, both live in production for weeks. That tracking job now belongs to CHANGELOG.md, which stays accurate because it's generated from real merges — stripped the stage-by-stage build plan (§12) and state table (§14) down to a pointer at it, keeping only Stage 6 (still unbuilt).
- The queue item example (§5.3) had a `capture_path` field that was never implemented (confirmed via `models.py`'s own comment) and was missing `url_rejected`, a real field.
- The enrichment `kind` values (§5.4) listed `none` (not real — unenriched items have `enrichment: null`, not a kind) and omitted `guide`, which is real.
- The enrichment-by-category table (§9.2) said project/idea/unclassified get no enrichment — actually all three get a `guide` pass; only todo/grocery skip enrichment. This was the biggest factual gap.
- Port 8100 vs. the spec'd 8080 (the compose file already explained this; PROJECT.md's own value never got updated).
- §9.3 said "do not build the Tandoor integration now" — it exists now, built at direct request in an earlier session.

**Two previously-unbuilt views from §10.4, built as part of this review:**
- **Lists** — one view each for grocery/todo/media. Grocery and todo are checklists — checking an item off calls the existing dismiss action and removes it from the list. Media links each row to its item card instead, since media (unlike todo/grocery) actually gets enriched and has real content worth seeing. No new backend needed — reuses `GET /api/items?category=` and the existing move endpoint.
- **Capture** — a new `GET /api/capture/{capture_id}` reads the original, unmodified Markdown off the `/data/archive` read-only mount (which existed in `docker-compose.yml` since Stage 4 but nothing ever read from it), guarded against path traversal the same way `vault.read_vault_note` is. A "View original capture" link on item detail (both active and archived items) opens it; content renders as plain text, not through react-markdown, since raw dictation isn't meant to be interpreted as Markdown syntax.

Re-enrich (§10.5) remains spec'd and unbuilt — noted honestly in the doc rather than left silently wrong.

### Test plan

- [x] Backend: `pytest` — 58 passed (up from 46: +12 capture unit + API integration tests)
- [x] Frontend: `npm test` (Vitest) — 42 passed (up from 34: +10 Lists/CaptureView/ItemDetail tests)
- [x] Frontend production build (`vite build`) still succeeds
- [x] Playwright pass against a sandboxed backend: grocery checklist check-off persists across reload, todo/media tabs both load, media row links to its item card, capture view renders real seeded content with no frontmatter leak, back navigation returns correctly, and a missing capture 404s

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
