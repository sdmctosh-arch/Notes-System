# Changelog

Every entry here corresponds to one merged pull request into `main`. New
entries are appended automatically by `.github/workflows/changelog.yml` when
a PR merges - see that workflow for how.

## 2026-08-23 - Deepen three more seams: keep_item, resolve_within, external-push adapter (#35)

### Summary
- `storage.keep_item()` now sequences vault-write, external push, and archive for the "keep" action - moved out of `main.py`'s `move_item` route handler, which is now a thin layer (candidate c2).
- `app/paths.py`'s `resolve_within()` replaces the resolve()+containment check that was copy-pasted across `capture.py`, `vault.py`, `logs.py`, and `static_files.py` (candidate c5).
- `app/external_push.py`'s `read_config()`/`best_effort()` share the config-or-skip and log-and-swallow shape between `tandoor.py` and `seerr.py`; each adapter keeps its own call sequence and exact log messages (candidate c6).

Follows the three "Strong" candidates already shipped in #34, from the same 2026-08-23 architecture review.

### Test plan
- [x] `pytest -q` in `backend/`: 148 passed
- [x] Updated the 4 `test_api.py` mocks that patched `main.push_recipe`/`push_media` to patch `storage.push_recipe`/`push_media` instead
- [x] Added `test_paths.py`, `test_external_push.py`, and two direct tests on `storage.keep_item`
- [x] Verified no unused imports left behind (`os` removed from `tandoor.py`/`seerr.py`)
- [x] Updated `docs/PROJECT.md`'s two mentions of the old per-file resolve()+containment pattern to point at `resolve_within()`/`app/paths.py`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-23 - Deepen three seams: pending-item guard, PageShell, ItemDetail chrome split (#34)

### Summary
Implements the three "Strong" candidates from the architecture review:

- **Centralize the item-mutation guard** — `storage.py`'s five pending-only mutations (`update_item`, `get_pending_item`, `add_chat_messages`, `set_pinned`, `request_reenrich`) now all route through one `_pending_item(queue_id)` seam instead of copy-pasting the same path+check, closing off the bug class that let a PATCH edit an archived item (fixed in 7464f3b).
- **One `PageShell`** — the loggedOut/isDesktop/wrap-or-shell branch that `VaultNote`, `CaptureView`, `ProcessorLog`, `Vault`, `Archive`, `Search`, and `Settings` each hand-wired identically is now one component (`frontend/src/components/PageShell.jsx`); each page shrinks to its own content plus a few PageShell props.
- **Split `ItemDetail`'s chrome from its core** — the embedded-vs-standalone page wrapper and back-link (`frontend/src/components/ItemShell.jsx`) are pulled out of the renamed `ItemDetailCore`, which stays the deep module (fetch/mutate/per-category render).

Pure refactor — no behavior change.

### Test plan
- [x] `pytest` — 137 passed
- [x] `vitest run` — 103 passed
- [x] `vite build` — succeeds
- [x] `oxlint` — no new warnings

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-22 - Add PWA support (installable, offline app shell) (#33)

### Summary
- Add PWA support via `vite-plugin-pwa` (`generateSW` strategy): a Workbox service worker precaches the built app shell only - never `/api/*`, so items, chat, and auth always hit the backend live even when the shell loads from cache.
- Add a web app manifest (name, icons, `display: standalone`, theme/background colors matching the existing brand purple/lavender) plus `apple-touch-icon`/`theme-color` meta tags, so "Add to Home Screen" on the phone installs a real app icon with no browser chrome.
- Generate `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (with proper safe-zone padding, checked against a circular mask), and `apple-touch-icon.png` from the existing `favicon.svg` logo.
- Fix a pre-existing bug this surfaced: the backend's SPA catch-all (`main.py`'s `spa_fallback`) served `index.html` for *every* unmatched path, including root-level build output like `favicon.svg` - harmless for a favicon (browsers just silently fail to render it), fatal for a service worker or manifest, which the browser refuses to register/parse when it gets HTML back instead of JS/JSON. Fixed with `app/static_files.py`'s `resolve_static_file`, the same resolve()+containment guard `capture.py`/`vault.py`/`logs.py` already use.
- Update `docs/PROJECT.md` (new section 10.8) per CLAUDE.md rule 8.

### Test plan
- [x] `npm test` (frontend) - 103/103 passing
- [x] `npm run lint` - no new warnings (pre-existing `set-state-in-effect` warnings only, unrelated to this change)
- [x] `npm run build` - succeeds; `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js`, `dist/icons/*.png` all generated
- [x] `python -m pytest -q` (backend) - 137/137 passing, including 5 new tests for `resolve_static_file` (existing file, nested file, missing file, directory, path traversal)
- [x] Manually verified end-to-end against a real `uvicorn` instance (not just `TestClient`) serving the built `dist/`: `/favicon.svg` → `image/svg+xml`, `/manifest.webmanifest` → `application/manifest+json`, `/sw.js` → `text/javascript`, `/icons/icon-192.png` → `image/png`, a path-traversal attempt still falls back safely to `index.html`, and a genuine SPA route (`/items/some-id`) still falls back to `index.html` too

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Add a read-only processor log viewer (#32)

### Summary
- New "Processor log" view (`/log`), linked from a Diagnostics section on the Settings page - lets the user see the PowerShell processor's classification/enrichment activity and errors without RDP-ing into the M720s.
- New read-only bind mount, `/data/logs` -> `E:\notes-system\logs` (`LOG_DIR`), the first time that directory has been visible to the container.
- `GET /api/logs` lists available dates (from `processor-<date>.log` filenames, newest first); `GET /api/logs/{date}` returns one day's content. `date` is validated against `^\d{4}-\d{2}-\d{2}$` before it ever touches the filesystem (stricter than the resolve()+containment check `capture.py`/`vault.py` use).
- Frontend page has a date picker (newest selected by default) and a Refresh button; no polling.
- PROJECT.md 10.2/10.4 updated to document the new bind mount and view.

### Test plan
- [x] `pytest` (backend) - 132/132 passing, including new `test_logs.py` and endpoint tests in `test_api.py` (auth-required, 404, path-traversal rejection)
- [x] `npm test` (frontend) - 103/103 passing
- [x] `npm run lint` / `npm run build` - clean
- [ ] Manual check against the live container after merge (queued as a follow-up in this session)

## 2026-08-22 - Add a Settings page (#31)

### Summary
- Add a Settings page (`/settings`), linked above Log out in both the mobile drawer and the desktop rail.
- Move the dark-mode toggle there from the drawer/rail (same `theme.js`/`notes-theme` storage, only relocated).
- Add a Compact rows toggle (denser InboxRow: less padding, no preview line, smaller badge/art) used in Inbox, Lists, and Archive.
- Make the New/Stale item-label day thresholds configurable (previously hardcoded to 1 and 7 days in `itemLabels.js`).
- All settings are client-side only, in one `notes-settings` localStorage blob (`frontend/src/settings.js` + `settings-hook.js`) - no backend/API changes.
- Update PROJECT.md 10.4 to document the new view and the moved/added settings.

### Test plan
- [x] `npm test` - 103/103 passing
- [x] `npm run lint` - no new warnings
- [x] `npm run build` - succeeds
- [x] Manually verified in a running dev instance: Settings page renders on desktop (rail highlights it, Log out still works), Dark mode toggle switches the whole page theme live, Compact rows and New-for-days both persist across a reload

## 2026-08-22 - Remove a path-traversal test that passed for the wrong reason (#30)

### Summary
While verifying PR #29's fix against a real `uvicorn` instance (not the in-process `TestClient`, which skips real HTTP parsing), found that `test_api_rejects_dot_dot_queue_id` was passing regardless of the fix: Starlette's own router already rejects a literal `..` and percent-encoded `%2e%2e`/encoded-slash traversal attempts before the app ever sees them, both with and without `_validate_queue_id` in place. The test's 404 assertion was true, just not for the reason its comment claimed.

Removed it and left a comment explaining why - the storage-layer function tests are the real proof (already verified by hand: reverted storage.py, confirmed `get_item("../../victim")` returned the planted file's content, `DID NOT RAISE ItemNotFoundError`, restored the fix, confirmed clean).

### Test plan
- [x] `python -m pytest -q` - 120/120 pass
- [x] Confirmed by hand against real `uvicorn` (both pre- and post-#29 code) that the removed test's premise was wrong

No functional code changed - test suite only.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix path traversal in queue_id path construction; least-privilege CI permissions (#29)

### Summary
GitHub code scanning (CodeQL) flagged 25 `py/path-injection` alerts (storage.py, capture.py, vault.py) plus one `actions/missing-workflow-permissions` warning. This PR fixes the real gap and the CI permissions warning; the capture.py/vault.py alerts are handled separately (see below).

- **`storage.py` (real vulnerability, confirmed exploitable):** every function taking a `queue_id` from a URL path segment built `QUEUE_PENDING_DIR/QUEUE_ARCHIVED_DIR / f"{queue_id}.json"` with no check that `queue_id` couldn't contain `../`. Unlike `capture.py`'s `read_capture` and `vault.py`'s `read_vault_note` (which both already `resolve()` and check containment - see their existing passing tests), storage.py had nothing. Confirmed before the fix: `storage.get_item("../../victim")` returned a planted file's content from outside the queue directory, no error.
- **Fix:** `_validate_queue_id` - an allowlist regex (`^[A-Za-z0-9._-]+$`, plus rejecting bare `.`/`..`) checked at the top of every function that takes an externally-supplied `queue_id`: `_find_item_path`, `update_item`, `get_pending_item`, `add_chat_messages`, `set_pinned`, `request_reenrich`, `unarchive_item`, `move_to_archived`. `create_item`'s `queue_id` is server-generated (`secrets.token_hex`), never attacker-influenced, so it's untouched.
- **`backend-tests.yml`:** added `permissions: contents: read` - the job only checks out code and runs pytest, so it never needs whatever broader default the repo/org grants `GITHUB_TOKEN` otherwise.

### Test plan
- [x] New `backend/tests/test_storage.py` (17 tests): validator unit tests (rejects `../`, backslash, embedded slashes, bare `.`/`..`, empty string; accepts real id shapes), plus `get_item`/`update_item`/`move_to_archived` tests that plant a file outside the queue tree and confirm it's unreachable, plus one HTTP-level 404 test.
- [x] Verified the tests actually catch the bug: reverted `storage.py` alone and reran - the traversal tests failed with `DID NOT RAISE ItemNotFoundError` (confirming genuine exploitability), restored the fix and reran clean.
- [x] Full suite: 121/121 pass (104 existing + 17 new).

### Not in this PR
The `capture.py`/`vault.py` alerts (7 of the 25) look like CodeQL false positives - both already `resolve()` + check containment before any file access, and both already have passing regression tests proving it (`test_read_capture_rejects_path_traversal`, `test_read_vault_note_rejects_path_traversal`), predating this PR. Planning to dismiss those specific alerts with that reasoning rather than change already-correct code, but wanted the real fix landed first.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix TMDB query encoding and move sandbox path fully outside E:\notes-system (#28)

### Summary
- `Get-TmdbArt` built its search query via `Invoke-RestMethod -Body`, which serializes as a form-encoded query string (`+` for spaces) instead of the `%20` encoding `Get-SteamGridDbArt` right next to it already uses via `[uri]::EscapeDataString`. Same bug class as the Seerr query-encoding fix (#19) - TMDB tolerates `+` in practice so this wasn't confirmed broken, but there's no reason to rely on that leniency when the sibling function already does it the explicit way.
- `Test-Sandbox.ps1`'s default `-SandboxRoot` was a subfolder of the real `E:\notes-system`. Safe in practice (wiped every run, never read), but in tension with CLAUDE.md rule 1's literal wording ("never write to `E:\notes-system` during development," no subfolder exception stated). Moved the default to `$env:TEMP`, fully outside it. `-SystemRoot` still points at the real `E:\notes-system` to read the existing `gemini.key.xml` - reading a secret is harmless, only writes needed to move.

### Test plan
- [x] Both scripts parse cleanly (`[System.Management.Automation.Language.Parser]::ParseFile`)
- [x] Extracted `Get-TmdbArt` from the real script and called it with `Invoke-RestMethod` shadowed to capture the built URI (no live TMDB call) - confirmed `%20`, not `+`, matching `Get-SteamGridDbArt`'s pattern
- [x] `Test-Sandbox.ps1 -SampleCount 1` run live against the real API: sandbox created under `%TEMP%\notes-system-sandbox-test`, completed a real classify pass, no writes under `E:\notes-system`, `-SampleCount 1` still doesn't crash (no regression on the #25 fix for that)

Found during a full-project review, left open pending your decision, now applied.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Add desktop rail to VaultNote and CaptureView (#27)

### Summary
- PR #21 added the desktop icon rail (`DesktopPageShell`) to Search, Vault, Archive, Lists, and New note, but missed the two pages those views open into: a vault note's content (`VaultNote.jsx`) and an item's original capture (`CaptureView.jsx`). On a desktop-width screen both rendered in the narrow mobile column with no rail - losing one-click navigation to any other section.
- Applied the same `isDesktop` + `DesktopPageShell` pattern already used by `Vault.jsx`/`Archive.jsx`. Kept each page's specific back link/button visible on desktop too (unlike Vault's generic "back to Inbox" link, which the rail already makes redundant) since these return to a specific place the rail can't.
- Updated PROJECT.md 10.4 to document the extension and why these two follow the rail pattern rather than `ItemDetail`'s documented full-page exception.

### Test plan
- [x] `npm test -- --run` - 103/103 pass (no test changes needed; `useIsDesktop` defaults to `false` in the jsdom test env, same as `Vault.test.jsx`/`Archive.test.jsx`, so existing mobile-path tests are unaffected)
- [x] `npx oxlint` on changed files - no new warnings

Found during a full-project review as an open question, resolved by extending the already-established pattern rather than declaring it an intentional gap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix ItemDetail reusing state across items in the desktop two-pane Inbox (#26)

### Summary
- The desktop two-pane Inbox (`Inbox.jsx`) renders `<ItemDetail id={selectedId} embedded />` without a `key`, so React reuses the same instance when a different row is clicked instead of remounting. `useEffect(load, [id])` refetches `item`/`error`, but nothing else is keyed to `id`: `editing`, `togglingPinned`, `ArtImage`/`MediaHero`'s `imgFailed`, and `ChatPanel`'s draft all carried over from the previous item.
- Split `ItemDetail` into an outer wrapper (resolves `id` from props or the route param) and an inner component keyed by it, so both the desktop embedded case and the mobile route case get a full remount on item switch.
- Removed the `bodyRef` scroll-reset effect and its comment - a remounted pane already opens at `scrollTop 0`, so it was dead weight once the real fix was in place.
- Added a regression test in `ItemDetail.test.jsx` that opens the edit form on one item, switches `id` (as the desktop pane does), and asserts the edit form is gone. Verified it fails without the fix (stuck showing the old item's edit form) and passes with it.

### Test plan
- [x] `npm test -- --run` - 103/103 pass (102 existing + 1 new)
- [x] `npx oxlint` on changed files - no new warnings
- [x] Manually reverted the `key` prop and re-ran the new test to confirm it catches the regression, then restored the fix

Found during a full-project review (background finding, not yet applied by that review's own PRs #22-25).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix processor: non-atomic queue write, dead code, retry classification (#25)

### Summary
- `Write-QueueRow` now writes via `Set-QueueItemAtomic` (temp+rename) instead of writing the queue JSON in place - PROJECT.md 10.6.
- Removed dead `$QueueDone` (`queue\done`) - never read anywhere, not part of the documented layout.
- An empty classifier result is now treated as transient (retried) instead of an immediate permanent failure.
- YouTube embed extraction now uses the same cleaned URL as `url`/`url_rejected`, not the raw one.
- Fixed an unrelated pre-existing bug found while verifying this: `Test-Sandbox.ps1 -SampleCount 1` crashed (`Select-Object -First 1` collapsing to a scalar, and even `@()` not surviving as an if/else branch's implicit output - needed the leading-comma pattern).

### Test plan
- [x] Parse-checked with `[System.Management.Automation.Language.Parser]::ParseFile`
- [x] `scripts\Test-Sandbox.ps1 -SampleCount 1 -Live` against a live sandbox - ran end to end, queue file written cleanly with no leftover `.tmp` file, correct system directories created (no `queue\done`)

### Deploy note
This only updates the repo checkout - `E:\notes-system\scripts\` is a separate copy the Task Scheduler job actually runs and needs a manual copy after merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix frontend: missing ambiguity_note, New/Stale label leaking into Archive (#24)

### Summary
- unclassified items never showed `ambiguity_note` anywhere - added it to the item detail page (PROJECT.md 10.4).
- `InboxRow`'s New/Stale label wasn't status-gated like `ItemDetail`'s, so it leaked into the Archive view on old/recently-archived items. Extracted a shared `isArchivedStatus()` helper into `itemLabels.js` so the two can't drift again.
- `ArtImage`/`MediaHero` permanently pinned the placeholder fallback after one failed image load, even once a re-enrich supplied a working URL. Now resets on `src` change.

### Test plan
- [x] `npm test -- --run` - 102 passed (2 new tests)
- [x] `npm run lint` - no new errors (2 new warnings match an existing set-state-in-effect pattern already used in 8 other files)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix stale/incomplete PROJECT.md (#23)

### Summary
- Section 1.4 listed Seerr as "Removed" while 9.2/10.5/14 describe it as a live, verified integration - fixed the contradiction.
- Added the missing `chat`/`pinned`/`manual` fields to the 5.3 queue-item example.
- Documented CHANGELOG #20's desktop greeting header + independent pane scrolling in 10.4, which was missed at merge time.

Docs-only change, no code touched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix backend: PATCH /api/items could edit archived/filed items (#22)

### Summary
- `storage.update_item` looked up the target file in both `queue/pending` and `queue/archived`, unlike every other mutation (pin, chat, reenrich), which are pending-only. That let `PATCH /api/items/{id}` silently edit an archived, dismissed, or even filed item's title/category/body, even though the frontend hides Edit for non-pending items and PROJECT.md 10.4 calls Archive read-only.
- Restricted `update_item` to `queue/pending`, matching the pattern used everywhere else, and added a regression test.

### Test plan
- [x] `python -m pytest` - 104 passed
- [x] New test `test_patch_404_for_archived_item` confirms a 404 and the on-disk file is untouched

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Add desktop rail to Search, Vault, Archive, Lists, New note (#21)

### Summary
- Search, Vault, Archive, Lists, and New note previously fell back to the same narrow `max-w-md` mobile column on a desktop-width screen, with no navigation rail - the desktop DesktopRail only ever appeared on the Inbox.
- These five views now render the persistent DesktopRail alongside a wider content pane (`DesktopPageShell.jsx`), matching the Inbox's desktop chrome. Only the Inbox keeps its two-pane list/detail split; the rest are single-pane, same content as mobile.
- DesktopRail now highlights whichever section is current (via `useLocation`) instead of always showing Inbox as active.
- Updated `docs/PROJECT.md` 10.x desktop section to describe the rail as shared chrome across top-level views, not Inbox-only.

### Test plan
- [x] `npm test` in `frontend/` - 99/99 passing
- [x] `npm run lint` - only pre-existing warnings on `useEffect(load, ...)` patterns unrelated to this change
- [x] Manually verified in Chrome against a throwaway mock backend at desktop width (1400x900): visited /search, /vault, /archive, /lists, /new and confirmed the rail renders with the correct icon highlighted and content displays correctly; confirmed Inbox's two-pane layout and rail highlighting still work unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix desktop Inbox: greeting header, independent pane scrolling (#20)

### Summary
- Desktop Inbox header now shows the time-of-day greeting ("Good morning" etc.), matching mobile, instead of a static "Inbox" label.
- The desktop two-pane Inbox (list + detail) now scrolls each pane independently within a fixed-height layout, instead of the whole page scrolling as one unit. Previously, scrolling the list down to an older note and opening it would scroll the detail pane out of view too, requiring a scroll back up to see it.
- The detail pane's body resets to the top whenever a different item is selected, so switching notes doesn't leave the new item scrolled to wherever the previous one was left.

### Test plan
- [x] `npm test` in `frontend/` - 99/99 passing
- [x] Manually verified in Chrome against a throwaway mock backend at desktop width (1400x900): scrolled list to an older note, clicked it, confirmed the detail pane opened fully visible at the top with no page-level scroll (`window.scrollY` stayed 0); confirmed list and detail scroll independently.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01LVxkJFudeEFZUx2h2oBhAx

## 2026-08-22 - Fix Seerr push: percent-encode the search query, not httpx's default + (#19)

### Summary
- Every "Keep in vault" on a movie/show has been silently failing to push to Seerr. Confirmed live: a real Seerr instance rejects the search call with `400 Bad Request` - `"Parameter 'query' must be url encoded. Its value may not contain reserved characters."`
- Root cause: `httpx.get(url, params={"query": item.title}, ...)` encodes a space as `+` (the `application/x-www-form-urlencoded` convention httpx's dict-style `params=` follows), but Seerr's strict query validator only accepts `%20` and treats `+` as an invalid reserved character.
- Fix: build the query with `urllib.parse.quote(item.title, safe="")`, which percent-encodes a space as `%20`.
- New regression test asserts `%20` appears and `+` does not, for a title with a space.
- `docs/PROJECT.md` 9.2 updated - this integration was "not verified against a live instance"; it now is, with this fix confirmed against one.

### Test plan
- [x] `backend/tests/test_seerr.py` - 9/9 pass (including the new regression test)
- [x] Full backend suite - 103/103 pass
- [x] Verified against the live Seerr instance directly: the same search call that previously 400'd now returns `200 OK` with real results for "American Gangster" (the exact title that surfaced this bug)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 2026-08-22 - Fix silent TMDB/SteamGridDB auth failures caused by PSCredential vs SecureString (#18)

### Summary
- Every `media_info` item was getting a real `HTTP 401` from TMDB in production, even with a freshly-verified, correct API key.
- Root cause: `gemini.key.xml` holds a bare `SecureString`, but `tmdb.key.xml` was created via `Get-Credential | Export-Clixml` (a `PSCredential`) - following this project's own setup instructions from an earlier session. `[Net.NetworkCredential]::new('', (Import-Clixml ...)).Password` only handles a bare `SecureString` correctly; handed a `PSCredential`, it silently coerces the whole object to its `.ToString()` and uses the literal string `"System.Management.Automation.PSCredential"` (41 characters) as the "password" - no exception, no warning, just an auth failure downstream that looks exactly like a bad or rate-limited key.
- New `Get-DecryptedSecret` helper detects which shape a secret file holds and extracts correctly either way. All three key-loading call sites (Gemini, TMDB, SteamGridDB) now go through it.
- **The existing `tmdb.key.xml` does not need to be recreated** - confirmed directly against both real key files on the production machine: `gemini.key.xml` (bare `SecureString`) and `tmdb.key.xml` (`PSCredential`) both now decrypt to the correct value through the new helper.
- Documented in `CLAUDE.md`'s "PowerShell errors to avoid" list, per this project's own convention.

### How this was found
Diagnosed live against the deployed script and real captures - ruled out TMDB key-propagation delay, request bursting, and Task Scheduler execution context (a throwaway diagnostic scheduled task using the same account/binary succeeded every time) before adding a temporary debug line to the *deployed* copy only (never committed) that printed the key's actual length/prefix/suffix reaching the HTTP call - which showed `len=41, "Syst...tial"`, immediately identifying the `PSCredential.ToString()` coercion. Debug line was removed before committing this fix.

### Test plan
- [x] `pwsh` parse check - no syntax errors
- [x] `Get-DecryptedSecret` tested directly against both real production key files (`gemini.key.xml`, `tmdb.key.xml`) - both now return the correct plaintext value
- [ ] Not yet re-verified with a live re-enrich against the real TMDB API after this deploys - will confirm after merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)

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
