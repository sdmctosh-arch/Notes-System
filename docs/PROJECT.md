# Note Capture and Enrichment System

Specification and build plan.
Document version 1.1. Date 2026-08-20. Revised to match what actually shipped
- see CHANGELOG.md for the detailed history this document no longer tracks.

---

## 1. Purpose and scope

### 1.1 Purpose

The system captures short notes from a phone. The system classifies each note.
The system adds information to each note. The system shows the results in a web
interface.

The user reads the results. The user decides what to keep.

### 1.2 Users

One user. No multi-user support. No user accounts.

### 1.3 In scope

- Capture of text and dictated notes on Android.
- Transfer of notes to a Windows server.
- Classification of notes into categories.
- Enrichment of notes with answers, summaries, and citations.
- A web interface to review, keep, or discard the results.
- A scheduled email that links to the web interface.

### 1.4 Out of scope

Do not add these components. The user rejected them or did not request them.

| Component | Status |
|---|---|
| Tunarr | Rejected |
| Seerr | Removed |
| Actual Budget | Removed |
| Cloudflare Tunnel | Not used |
| Tailscale | Not used. Use NordVPN Meshnet |
| Recyclarr | Not used |
| Portainer | Not used |
| Immich, Jellyfin, ErsatzTV | Not used |
| A database server | Not used. See section 4.4 |
| Direct execution of home automations | Not in this version. See section 9.4 |

---

## 2. Environment

### 2.1 Server

| Item | Value |
|---|---|
| Machine | Lenovo ThinkCentre M720s |
| Operating system | Windows 11 |
| Mode | Headless |
| Shell | PowerShell 7 |
| Storage | One 4 TB external USB disk at `E:` |
| Container runtime | Docker Desktop with the WSL2 backend |

Do not recommend more disks. The storage is fixed.

### 2.2 Phone

| Item | Value |
|---|---|
| Platform | Android |
| Capture application | MacroDroid |
| Dictation | FUTO Voice Input (on-device Whisper) |
| Synchronization | Syncthing-Fork |

### 2.3 Network and access

| Item | Value |
|---|---|
| Internet | Spectrum 1 Gbps |
| Router | eero mesh |
| Switch | TP-Link TL-SG105 |
| Backbone | MoCA over coax |
| Remote desktop | Chrome Remote Desktop |
| Private network path | NordVPN Meshnet |

Do not add a port forward for the web interface.

### 2.4 External services

| Service | Use |
|---|---|
| Gemini API, `generateContent` | Classification |
| Gemini API, Interactions endpoint | Enrichment with tools |
| TMDB API, `/search/movie`, `/search/tv` | Poster/backdrop image lookup for a `media` item. Optional, best-effort like Tandoor/Seerr below - see 9.2 |

---

## 3. Architecture

### 3.1 The three parts

The system has three parts. Each part has one responsibility. Each part can
change without a change to the other parts.

| Part | Responsibility | Technology |
|---|---|---|
| 1. Capture | Records a thought and puts it on the server | MacroDroid, Syncthing |
| 2. Processing | Classifies, enriches, and stores results | PowerShell 7 |
| 3. Interface | Shows results and records decisions | Docker, web browser |

### 3.2 Data flow

```
[Phone]
   |  MacroDroid writes a Markdown file
   v
[/storage/emulated/0/notes-inbox/]
   |  Syncthing
   v
[E:\notes\_Inbox\]
   |  Processor moves the file out of the synchronized folder
   v
[E:\notes-system\processing\]
   |  Pass 1: classify (Gemini, schema, no tools)
   |  Pass 2: enrich (Gemini, tools, citations)
   v
[E:\notes-system\queue\pending\*.json]     <- one file for each item
[E:\notes\Archive\Captures\*.md]           <- the original capture
   |
   v
[Web interface]
   |  The user keeps, archives, or discards each item
   v
[E:\notes\<category folder>\*.md]          <- kept items
[E:\notes-system\queue\archived\]          <- decided items
```

### 3.3 Interface boundaries

The parts communicate through files only. There is no API between the parts.

- Part 1 writes Markdown files to the synchronized folder.
- Part 2 reads that folder. Part 2 writes JSON files to the queue.
- Part 3 reads the queue. Part 3 moves queue files and writes Markdown files.

Part 3 does not call the Gemini API for classification or enrichment - those
stay processor-only and file-based, exactly as described above.

**One deliberate exception: item chat (10.4).** A live follow-up
conversation needs a synchronous reply, which the processor's every-5-minute
file-based pipeline can't give. The interface calls the Interactions API
directly for this one feature, using its own `GEMINI_API_KEY` (same key
material as `gemini.key.xml`, just also given to this container as a plain
env var - see `.env.example` - since DPAPI only decrypts for one Windows
user on one machine, not a Linux container). See `backend/app/gemini_chat.py`.

---

## 4. Directory layout

### 4.1 The vault

`E:\notes\` is an Obsidian vault. It contains content for the user to read.

```
E:\notes\
  _Inbox\              <- the Syncthing shared folder. Only this folder syncs
  Recipes\
  Projects\
  Ideas\
  Unclassified\
  Archive\Captures\    <- the original capture files
  .obsidian\
```

### 4.2 The system directory

`E:\notes-system\` contains machinery. It is not in the vault. It is not
synchronized.

```
E:\notes-system\
  processing\          <- captures in progress. Retried on the next run
  failed\              <- captures with a permanent error
  queue\
    pending\           <- items for the user to review
    archived\          <- items the user decided
  logs\
  scripts\
  ledger.jsonl         <- one line for each processed capture
  gemini.key.xml       <- DPAPI-encrypted API key
```

### 4.3 Rule: do not mix the two trees

Do not put machinery in `E:\notes\`. Obsidian indexes all files in the vault.
Syncthing propagates all files in a shared folder.

### 4.4 Rule: no database

Do not add SQLite, Postgres, or any database server.

Reason: the data lives on an NTFS disk. A database file on an NTFS bind mount
in Docker can become corrupt. Plain JSON files do not have this problem.

If a future component needs a database, put the database in a Docker named
volume on the WSL2 ext4 file system. Do not put it on `E:`.

---

## 5. Data formats

### 5.1 Capture file

MacroDroid writes this file. The file name is the timestamp.

File name format: `YYYY-MM-DD-HH-mm-ss[-am|-pm].md`

```markdown
---
id: 2026-08-11-13-30-10-pm
captured: 2026-08-11-13-30-10-pm
source: android
capture_type: inbox
---

Pack for Florida tonight. Lookup if pier sixty six has laundry.
```

Rules:
- The processor takes the identifier and the time from the **file name**, not
  from the frontmatter. The frontmatter can contain errors.
- The frontmatter block must start on line 1.
- The body must not be empty.

### 5.2 Ledger record

`ledger.jsonl` contains one JSON object for each line. The file is append-only.
Do not rewrite this file.

```json
{
  "id": "2026-08-11-13-30-10-pm",
  "source_file": "2026-08-11-13-30-10-pm.md",
  "body_hash": "B982C47A...",
  "captured": "2026-08-11T13:30:10.0000000-04:00",
  "body_chars": 63,
  "truncated": false,
  "item_count": 2,
  "categories": ["todo", "lookup"],
  "status": "processed",
  "processed_at": "2026-08-18T16:08:22.9750420-04:00",
  "processor_version": "0.2",
  "model": "gemini-3.1-flash-lite"
}
```

Values of `status`: `processed`, `duplicate`, `test`, `failed`.

### 5.3 Queue item

One JSON file for each item. The file name is the `queue_id`.

```json
{
  "queue_id": "2026-08-11-13-30-10-pm-02",
  "capture_id": "2026-08-11-13-30-10-pm",
  "category": "lookup",
  "title": "Pier 66 laundry",
  "body": "Find out if Pier 66 has laundry.",
  "url": null,
  "url_rejected": null,
  "media_type": null,
  "timing": null,
  "proposed_automation": null,
  "approved_automation": null,
  "ambiguity_note": null,
  "captured": "2026-08-11T13:30:10-04:00",
  "created": "2026-08-18T16:08:22-04:00",
  "status": "pending",
  "enrichment": null,
  "processor_version": "0.2"
}
```

There is no `capture_path` field - the original capture always lives at
`Archive\Captures\<capture_id>.md`, so `capture_id` plus that fixed naming
convention is enough to find it. See "Capture" under 10.4.

Values of `status`:

| Value | Meaning |
|---|---|
| `pending` | The user has not decided |
| `enriched` | Enrichment is complete. The user has not decided |
| `filed` | A Markdown note exists in the vault |
| `archived` | The user kept the item in the queue only |
| `dismissed` | The user discarded the item |
| `enrich_failed` | Enrichment failed. The item is still usable |

### 5.4 Enrichment record

The `enrichment` field holds the result of pass 2. The field is `null` before
enrichment.

```json
{
  "enrichment": {
    "kind": "answer",
    "summary": "Small songbirds live 2 to 5 years in the wild...",
    "detail": "Full Markdown text...",
    "citations": [
      { "title": "Bird lifespan data", "url": "https://example.org/a" }
    ],
    "embed": {
      "type": "youtube",
      "video_id": "DW0XUsyBBuY"
    },
    "structured": null,
    "model": "gemini-3.5-flash",
    "enriched_at": "2026-08-18T17:02:11-04:00"
  }
}
```

Values of `kind`: `answer`, `page_summary`, `media_info`, `recipe`, `guide`.
There is no `"none"` value - an item that was not enriched has `enrichment`
itself set to `null`, not an enrichment object with an empty kind.

The `structured` field holds category-specific data. For a recipe it holds a
schema.org/Recipe object. See section 9.3.

---

## 6. Part 1: capture

Status: **complete**.

### 6.1 MacroDroid macro

| Element | Value |
|---|---|
| Trigger | Widget Button (Pressed) |
| Action 1 | Set Variable `note_text`, source User Prompt |
| Action 2 | If `note_text` is not empty |
| Action 3 | Write to File |
| Action 4 | Toast "Captured" |

Write to File settings:

| Setting | Value |
|---|---|
| Directory | `/storage/emulated/0/notes-inbox/` |
| File name | Timestamp, then `.md` |
| Append | Off |

### 6.2 Android permissions

- Give MacroDroid All files access.
- Set battery optimization for MacroDroid to "Don't optimize".
- Set battery optimization for Syncthing-Fork to "Don't optimize".

### 6.3 Known limits

- The macro creates a new file for each capture. The macro does not edit files.
  This prevents synchronization conflicts.
- A prefix in the note text is a strong signal. Example: `Tv chuck`. The
  classifier honors a prefix. A prefix is optional.

---

## 7. Part 1: transport

Status: **complete**.

### 7.1 Syncthing folder pair

| Device | Path |
|---|---|
| Phone | `/storage/emulated/0/notes-inbox/` |
| Server | `E:\notes\_Inbox` |

Only this folder synchronizes. The vault does not synchronize to the phone.

### 7.2 Rules

- The processor ignores files that changed in the last 15 seconds. This prevents
  a read during a transfer.
- The processor ignores files that match `.*` or `*~syncthing~*`.

---

## 8. Part 2: processor

Status: **complete. Live in production** on the schedule in 8.4. Script:
`Invoke-NoteProcessor-v2.ps1`.

### 8.1 File lifecycle

1. Read the file in `_Inbox`.
2. Parse the frontmatter. Get the identifier and time from the file name.
3. Calculate a SHA-256 hash of the normalized body.
4. If the identifier is in the ledger, archive the file. Do not process it.
5. If the hash is in the ledger, archive the file. Record status `duplicate`.
6. If the body starts with `test`, archive the file. Record status `test`.
7. Move the file to `processing\`.
8. Classify the body. See section 9.1.
9. Enrich each item. See section 9.2.
10. Write one queue file for each item.
11. Move the capture to `Archive\Captures\`.
12. Append one line to the ledger.

### 8.2 Failure states

Each capture must reach one state only. A capture must not disappear.

| Error type | Action |
|---|---|
| Transient (HTTP 429, HTTP 5xx, network, `MAX_TOKENS`) | Keep the file in `processing\`. Increase the attempt count. Retry on the next run |
| Transient, after 5 attempts | Move to `failed\`. Write a `.reason.txt` file |
| Permanent (no frontmatter, empty body, invalid JSON) | Move to `failed\` at once. Write a `.reason.txt` file |

### 8.3 Concurrency

- The processor writes `.lock` in `E:\notes-system\` at the start.
- The processor deletes `.lock` in a `finally` block.
- A lock more than 30 minutes old is stale. The processor takes over.
- Windows Task Scheduler must have "Do not start a new instance" set.

### 8.4 Schedule

| Item | Value |
|---|---|
| Program | `C:\Program Files\PowerShell\7\pwsh.exe` |
| Arguments | `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "E:\notes-system\scripts\Invoke-NoteProcessor-v2.ps1" -Model <model>` |
| Repeat | Every 5 minutes |
| Account | The same account that created `gemini.key.xml` |
| "Run only when user is logged on" | Checked - required for DPAPI, see below |

The DPAPI key decrypts for one user on one machine only. A different account
cannot read the key. That requirement forces "Run only when user is logged
on" instead of "Run whether user is logged on or not," and a task with that
setting runs in the interactive session - so unlike a non-interactive task,
it can flash a console window on screen every 5 minutes even with
`-WindowStyle Hidden` on the command line, because that flag hides the
window pwsh.exe itself opens but does not stop the brief flash while Task
Scheduler launches it. If `-WindowStyle Hidden` alone does not fully
suppress it (this could not be confirmed against the real Windows
Task Scheduler from this environment - verify on the deployment machine),
the reliable fix is a one-line VBScript launcher that starts pwsh.exe with
window style `0` (fully hidden, no flash) and points the task at that
instead:

```vbscript
' E:\notes-system\scripts\Run-NoteProcessor-Hidden.vbs
CreateObject("WScript.Shell").Run _
    "C:\Program Files\PowerShell\7\pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ""E:\notes-system\scripts\Invoke-NoteProcessor-v2.ps1"" -Model <model>", _
    0, False
```

Then set the task's Program to `wscript.exe` and Arguments to
`"E:\notes-system\scripts\Run-NoteProcessor-Hidden.vbs"`, keeping the same
Account and "Run only when user is logged on" setting as above.

### 8.5 PowerShell rules

These errors occurred during development. Do not repeat them.

- PowerShell unrolls a collection on return. Write `return ,$hashSet` to keep a
  `HashSet`. Write `@(Function-Name)` at the call site for an array.
- A `Mandatory` `[string[]]` parameter rejects an empty string element. Add
  `[AllowEmptyString()]` and `[AllowEmptyCollection()]`.
- Read a file with `Get-Content -Raw`. Split the text manually. Do not use the
  array form for near-empty files.
- `Move-Item` fails if the target exists. Use a unique-path function.

---

## 9. Part 2: classification and enrichment

### 9.1 Pass 1, classification

| Item | Value |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Header | `x-goog-api-key` |
| Model | `gemini-3.1-flash-lite` |
| Temperature | 0 |
| `responseMimeType` | `application/json` |
| `responseSchema` | Present. See the script |
| Tools | None |
| Input limit | The first 800 characters of the body |

The prompt is in `classify-prompt.md`. Do not put the prompt in the script.

Categories:

| Category | Description |
|---|---|
| `lookup` | A question or a topic to find out |
| `reference` | A link or article to read or watch |
| `todo` | A personal or household action |
| `project` | Technical, homelab, or server work |
| `recipe` | A recipe or a link to a recipe |
| `idea` | Something to build or explore |
| `media` | A title to watch, play, or listen to |
| `grocery` | An item to buy |
| `unclassified` | Unknown. The model explains in `ambiguity_note` |

One capture can produce many items. Short notes are often multi-item.

**Measured performance** on a 26-capture corpus with `gemini-3.1-flash-lite`:
26 of 26 categories correct. Token use is near 870 input and 100 output for each
capture.

**Known defects.** Accept these. Do not try to correct them with more prompt
text.

| Defect | Effect |
|---|---|
| `automation_candidate` is sometimes set on a `project` item | None. Code removes it. See section 9.4 |
| Output is not identical between runs at temperature 0 | Minor. A `media_type` value can change |
| The `url` field can contain model commentary | Code validates the field. See section 9.4 |
| Recipe text is reformatted | None. The original text is filed. See section 9.4 |

### 9.2 Pass 2, enrichment

| Item | Value |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| Model | A Gemini 3 series model that supports tools |
| Tools | `google_search`, `url_context` |
| `store` | `false` |
| Output | `response_format` with a JSON schema |

Enrichment runs for each item. Enrichment does not run for every category.

| Category | Enrichment | Result `kind` |
|---|---|---|
| `lookup` | Answer the question. Give citations | `answer` |
| `reference` | Read the URL. Summarize. Give citations | `page_summary` |
| `media` | Find the correct title, year, and type | `media_info` |
| `recipe` | Convert to schema.org/Recipe | `recipe` |
| `project`, `idea`, `unclassified` | Research prior art, a how-to, or options. Write a short brief | `guide` |
| `todo` | None - `enrichment` stays `null` | n/a |
| `grocery` | None - `enrichment` stays `null` | n/a |

Only `todo` and `grocery` are task items and skip enrichment entirely. Every
other category - including `project`, `idea`, and `unclassified`, which this
table originally marked as unenriched - gets a real enrichment pass. This
table describes the actual implemented scope, which turned out broader than
the original plan.

Rules:
- Enrichment failure is not a capture failure. Set `status` to `enrich_failed`.
  Keep the item in the queue.
- Store citations as data. Do not store citations only inside the text.
- If the URL is a YouTube link, extract the video identifier. Put the identifier
  in `enrichment.embed`.

Not in the original plan: a `media_info` item also gets a poster/backdrop
image, looked up directly against the TMDB API (`Get-TmdbArt` in
`Invoke-NoteProcessor-v2.ps1`) once enrichment has confirmed the title and
year - not via Gemini's own search tools, since TMDB gives back an
addressable image URL for a specific title/year in one call rather than
leaving the model to guess at one. Matches the same way `push_media`
(below) matches against Seerr's TMDB-backed search: by title, filtered to
the result whose release/air year equals the year enrichment found. Uses
the classifier's schema-enforced top-level `media_type` (not enrichment's
free-text `structured.media_type`) to decide whether to call TMDB at all -
`game` and `music` have no TMDB equivalent and are skipped without a call,
same as `push_media`. Optional and best-effort like Tandoor/Seerr: with no
`$env:TMDB_API_KEY` or `tmdb.key.xml` configured, or no year, or no matching
result, `structured.image`/`structured.backdrop` are just left `null` and
the item still queues normally - a missing poster is not a failure. Stored
as plain URLs, hotlinked by the frontend (10.4) - nothing is downloaded or
cached.

Not in the original plan: "Keep in vault" on a `media` item whose top-level
`media_type` is `tv` or `movie` (the classifier's schema-enforced field,
not enrichment's free-text `structured.media_type`) also requests it in a
self-hosted Seerr instance via `SEERR_URL`/`SEERR_API_KEY`
(`backend/app/seerr.py`), best-effort like the Tandoor push below - a Seerr
outage never blocks filing the note. Not literal notes: Seerr has nowhere
to attach arbitrary text to a title, so this requests the title instead,
the way a person would add it themselves. Matches by searching Seerr
(TMDB-backed) by title and requiring the result's release/air year to
match `enrichment.structured.year` - no year, or no result in that year,
means skip rather than request the wrong title. `game` and `music` items
have nothing to request and are skipped without a call. Built from Seerr's
public API docs, not verified against a live instance; check the container
logs after the first real "Keep in vault" on a movie or show.

### 9.3 Recipe conversion

Convert a recipe item to a schema.org/Recipe object at processing time. Put the
object in `enrichment.structured`.

Required properties: `name`, `recipeIngredient`, `recipeInstructions`.
Optional properties: `description`, `recipeYield`, `prepTime`, `cookTime`,
`totalTime`, `recipeCategory`, `recipeCuisine`, `image`.

Use ISO 8601 duration format for times. Example: `PT30M`.

Not in the original plan: `image` is a URL to a photo of the finished dish,
found by the same enrichment call using its existing `google_search`/
`url_context` tools (unlike a `media` item's poster - see 9.2 - a recipe's
image comes from the model's own search, not a separate lookup), per
`enrich-prompt.md`'s "Recipe conversion" section. The source page's photo is
preferred when the item has a `url`; otherwise, or if that page has none,
the model searches for a similar recipe for the same dish and uses its
photo instead - it does not have to be a photo of this exact source. Left
`null` when no suitable photo turns up. Validated with the same rule as the
top-level `url` field (9.4) before being stored; an invalid value is
dropped to `null` rather than kept anywhere, since it is a nicety and not
user data. Stored as a plain URL, hotlinked by the frontend (10.4) - nothing
is downloaded or cached.

This object is the input for the Tandoor import: "Keep in vault" on a recipe
pushes it to a self-hosted Tandoor instance via `TANDOOR_URL`/
`TANDOOR_API_TOKEN` (`backend/app/tandoor.py`), best-effort - a Tandoor
outage never blocks filing the note. Verified 2026-08-21 against a live
Tandoor instance. The push is two calls, not one: POST to
`/api/recipe-from-source/` only parses the recipe and returns a preview -
it never saves anything on its own (confirmed by reading Tandoor's server
source). The parsed `recipe` object from that response is then POSTed to
`/api/recipe/` to actually create it; only that second call's result
counts as success. Check the container logs after a "Keep in vault" on a
recipe if something still doesn't show up.

### 9.4 Code guards

These guards do not depend on model behavior. Do not remove them.

| Guard | Rule |
|---|---|
| Automation allowlist | Remove `automation_candidate` unless the category is in `$AutomationAllowedCategories` **and** the value is in `$AllowedAutomations`. `$AllowedAutomations` is empty. Record the proposed value in `proposed_automation` |
| URL validation | A URL is valid only if it is absolute, has scheme `http` or `https`, and contains no white space. Put an invalid value in `url_rejected` |
| Recipe image validation | A recipe's `structured.image` (9.3) is checked with the same absolute-`http(s)`-no-whitespace rule as the URL guard above, but an invalid value is dropped to `null` - there is no `image_rejected` field, since this is a nicety, not user data worth keeping around to inspect |
| Content hash | Compare the SHA-256 of the normalized body against the ledger. Do not process a repeat |
| Truncation | If `truncated` is `true`, file the **original** body text. Do not file the model output |

---

## 10. Part 3: web interface

Status: **complete. Live in production**, plus Vault and Search (10.4) -
neither spec'd here originally - beyond this section's original scope.

### 10.1 Purpose

Show the queue. Let the user decide what to keep.

### 10.2 Technology

| Item | Value |
|---|---|
| Deployment | One Docker container on the M720s |
| Backend | Python 3.12, FastAPI |
| Frontend | React, Vite, Tailwind CSS |
| Build | The frontend builds to static files. FastAPI serves the files |
| Storage | JSON files on a bind mount. No database |
| Port | 8100 on the LAN only (this section originally specified 8080; 8100 is what's actually deployed) |

Bind mounts:

| Container path | Host path | Mode |
|---|---|---|
| `/data/queue` | `E:\notes-system\queue` | Read and write |
| `/data/vault` | `E:\notes` | Read and write |
| `/data/archive` | `E:\notes\Archive\Captures` | Read only |

### 10.3 Authentication

- One password. Read the password hash from an environment variable.
- Set a session cookie after a correct password.
- Do not create user accounts.
- Do not add a port forward on the router. Use Meshnet for remote access.

### 10.4 Views

**Inbox.** The default view. Shows items with status `pending` or `enriched`.
Sort by capture time, newest first. Filter by category.

Not in the original plan: a "New" or "Stale" label on the item card and item
detail header, computed client-side from `captured` (not `created` - see
5.3) so it agrees with the "time ago" text next to it. "New" for the first
24 hours after capture, "Stale" once 7 days have passed with no decision -
the label just stops rendering once the item is filed, archived, or
dismissed, since it leaves the pending queue at that point anyway. No new
backend field; see `frontend/src/itemLabels.js`.

Not in the original plan: a welcome header above the filter chips - "Good
morning"/"Good afternoon"/"Good evening" (computed client-side from the
local hour, not a stored name - this is a single-user app with no profile
field to greet by, per 10.3) and a one-line count of new vs. total notes.
Below it, pending items split into a "Pinned" group and a "To review" group
(10.5) - the split only renders when at least one item is pinned, so an
Inbox with nothing pinned looks exactly like it did before pinning existed.

Not in the original plan: on a phone-width screen, the row of nav icons
above the item list is gone - a single hamburger button opens a slide-in
drawer instead (Inbox, Lists, Vault, Archive, a dark-mode switch, and log
out), and a floating "+" button in the bottom corner replaces the old
header "+" link for New note. See `frontend/src/components/Drawer.jsx`.

Not in the original plan: on a desktop-width screen (1024px and up, see
`frontend/src/useIsDesktop.js`) the Inbox becomes a two-pane layout instead
of a single column - a persistent icon rail on the far left
(`components/DesktopRail.jsx`, the desktop counterpart to the mobile
drawer), a list pane in the middle (the same items, grouping, and filter
chips as the mobile view), and a detail pane on the right that shows
whichever row was last clicked. Clicking a row does not navigate or change
the URL - it only changes which item the detail pane renders
(`ItemDetail`'s `id`/`embedded` props, `pages/Inbox.jsx`) - so the list
stays visible while browsing. Keep/Archive/Dismiss in the detail pane clear
the selection and reload the list instead of navigating to `/`, since the
Inbox is already the page being shown. Every other view (Archive, Vault,
Search, an item opened from one of those) keeps the single always-full-page
detail view unchanged, on desktop and phone alike - only the Inbox has a
two-pane mode.

Not in the original plan: `media` and `recipe` items get an art slot instead
of the usual category-color badge - a real image
(`frontend/src/components/ArtImage.jsx`) when enrichment found one (a TMDB
poster/backdrop for `media`, 9.2; a dish photo for `recipe`, 9.3), falling
back to the original labelled striped placeholder
(`components/ArtPlaceholder.jsx`) when it didn't - no URL from enrichment,
or a hotlinked one that failed to load (nothing is downloaded or cached;
see 9.2/9.3). Layout is unchanged from the original placeholder-only
design: a 2:3 "poster" thumbnail in the list for `media`, a 1:1 "dish"
thumbnail for `recipe`; in the item detail, `media` gets a 16:9 backdrop
above the header (a dashed title-logo box and a type/year caption overlay
the placeholder only - a real backdrop image drops the title-logo box,
since it was always a stand-in for art this system has no way to produce)
and `recipe` gets a 4:3 inset image ahead of the ingredients. See
`components/InboxRow.jsx` and `pages/ItemDetail.jsx`.

**Item card.** The content changes with the category.

| Category | Card content |
|---|---|
| `lookup` | The question. The answer. Citation links |
| `reference` | The page title. The summary. Citation links. A YouTube player if the URL is a video |
| `media` | The title, type, and year. A poster/backdrop image is not required - shows a placeholder slot until a real image source is wired up (see below) |
| `recipe` | The recipe name. Ingredients. Steps |
| `todo`, `project`, `idea` | The title and the body |
| `unclassified` | The title, the body, and the `ambiguity_note` |

**Lists.** One view for each of `media`, `todo`, and `grocery`. `todo` and
`grocery` are checklists - checking an item off dismisses it. `media` links
each row to its item card, since media (unlike todo/grocery) is enriched and
has a real card worth seeing.

**Archive.** Shows items with status `archived`, `filed`, or `dismissed`.
Read only, except for Unarchive (10.5) on `archived`/`dismissed` items - not
in the original plan. Include a search field.

**Capture.** Shows the original Markdown file for an item, unmodified by
classification or enrichment - what the phone actually captured. Read only.
Reachable from a "View original capture" link on the item card, for both
active and archived items. Reads `Archive\Captures\<capture_id>.md` off the
`/data/archive` read-only bind mount (10.2).

**Vault.** Not in the original plan. Read-only browser for the Markdown notes
"Keep in vault" produces, grouped by category folder (Recipes/Projects/
Ideas/Unclassified). Deliberately scoped to only those folders, never a walk
of the whole vault - `VAULT_DIR` is the user's entire real notes vault, not
something this system owns.

**Chat.** Not in the original plan. A live follow-up conversation on the
item card, below the enrichment content - "Follow up," a message history,
and a text field. Uses the note's title/body/enrichment as context and the
same tools as enrichment (`google_search`, `url_context`), so a follow-up
can look something up, not just reason over what's already there. This is
the one place the interface calls the Gemini API directly (3.3) - everything
else stays processor-only and file-based. Persisted into the item's own JSON
(a `chat` field, same atomic-write pattern as everything else - still just a
file, no database), so it survives a reload and travels with the item if
it's later filed. Pending items only, the same restriction every other
mutation has - archived items are read-only, chat included.

**Search.** Not in the original plan. One search field across Inbox, Archive,
and Vault notes (title, body, enrichment text).

**New note.** Not in the original plan. A "+" on the Inbox header opens a
form (category, optional title, body) and `POST /api/items` writes a queue
item straight into `queue\pending\` - skipping classification entirely,
since the user already picked the category. A third documented exception to
"the processor creates files in `queue\pending\` only" (3.3's chat
exception, 10.6's reenrich-marker exception, and now this). The item is
marked `manual: true` (it has no real capture file behind it - `capture_id`
is a synthetic id, not a real `Archive\Captures\*.md` filename - so the
client uses this to skip the "View original capture" link). For any
category the processor actually enriches (everything except `todo` and
`grocery` - 9.2's `$TaskCategories`), creating the note also drops a
`.reenrich` marker (10.5) so it gets enriched on the processor's next run,
the same as if it had come in from the phone.

### 10.5 Actions

| Action | Effect |
|---|---|
| Keep in vault | Write a Markdown file to the correct vault folder. Set `status` to `filed`. Move the queue file to `archived\` |
| Archive | Set `status` to `archived`. Move the queue file to `archived\` |
| Dismiss | Set `status` to `dismissed`. Move the queue file to `archived\` |
| Change category | Change `category`. Keep `status` as it is |
| Edit title or body | Change the field. Do not change the original capture |
| Pin | Not in the original plan. Toggle `pinned` on the item. Pending only, like every other mutation - once archived/filed/dismissed the pin can still be seen but no longer changed. Pinned items sort to a "Pinned" group at the top of the Inbox (10.4) |
| Re-enrich | Write a request file. The processor enriches the item on the next run |
| Unarchive | Not in the original plan. `archived`/`dismissed` only. Move the queue file back to `pending\`. Recompute `status` (`enriched` if `enrichment` is set, else `pending`) - `captured` is left untouched, so the item returns at its real age |
| Share | Not in the original plan. Client-only, no request to the interface's backend at all - available on every item regardless of status. Uses the Web Share API (`navigator.share`) to hand the item's title, summary (or body, if unenriched), and original URL to another app on the phone; falls back to copying the same text to the clipboard when the browser has no share sheet, or when the user's chosen app rejects the share for a reason other than cancelling. See `frontend/src/shareText.js` and `components/ShareButton.jsx` |

`Unarchive` does not apply to `filed` - "Keep in vault" already wrote a
real Markdown file to the vault (and, for a recipe or movie, possibly
pushed to Tandoor or Seerr too), neither of which this can safely reverse,
so a filed item stays permanent. `POST /api/items/{id}/unarchive` 409s for
it, the same as for a pending item that was never archived at all.

The interface must not call the Gemini API. Re-enrichment is a request to the
processor, not a call the interface makes itself - `POST
/api/items/{id}/reenrich` just touches an empty `<queue_id>.reenrich` marker
in `queue\pending\`. Pending only, and only for a category the processor
actually enriches (todo and grocery never are - see 9.2's `$TaskCategories`
- the interface hides the button for those, and the processor drops the
marker harmlessly if one shows up anyway). The processor's
`Invoke-ReenrichRequests` (in `Invoke-NoteProcessor-v2.ps1`) scans for these
markers on every run, redoes pass 2 with the item's current category/title/
body/url, and removes the marker either way. On success it overwrites
`enrichment` and sets `status` to `enriched`; on failure it leaves the item
completely unchanged (never wipes a working enrichment because a retry
failed) and just logs a warning. The interface never sees whether the retry
worked - only that the request was made.

### 10.6 File safety rules

- Write to a temporary file. Then rename the file. Do not write in place.
- The processor creates queue item (`.json`) files in `queue\pending\` only.
  Two documented exceptions: `queue\pending\*.reenrich` marker files (10.5) -
  the interface creates those, the processor deletes them - and a New note
  (10.4), which the interface writes directly as a queue item `.json` file,
  skipping classification. Both alongside chat's exception to "the
  interface does not call the Gemini API" (3.3).
- The interface moves files from `queue\pending\` to `queue\archived\` for
  Keep/Archive/Dismiss, and the reverse direction for Unarchive
  (`archived`/`dismissed` only, per 10.5) - the only two directions it ever
  moves a queue item file.
- Read all JSON as UTF-8.

### 10.7 Design requirements

- The layout must work on a phone screen and a desktop screen.
- Show the category with a color and an icon.
- A YouTube link shows an embedded player.
- Show a citation as a link with the source title.
- The interface must show a clear empty state when the queue is empty.

---

## 11. Part 2: digest email

Status: **to build**.

- Send on a schedule. The user selects the time.
- Show counts for each category since the last email.
- Show the titles of new `lookup` and `reference` items with the first line of
  the summary.
- Include a link to the web interface.
- Do not include full content. The email is a notification.

---

## 12. Build order

Stages 1-5 (enrichment, backend API, frontend, container, live operation)
are complete. This section originally carried a test for each - that job
now belongs to CHANGELOG.md (one entry per merged PR, updated automatically)
and the git history, both of which stay accurate on their own instead of
needing to be hand-maintained here. One stage remains:

### Stage 6. Digest email

**Test.** Receive one email. Confirm the link opens the interface.

---

## 13. Rules for development

1. Use PowerShell 7 for server tasks. Use bash only if a tool requires it.
2. Test in a sandbox before you use the real vault. Copy the vault path. Do not
   write to `E:\notes` during development.
3. Use the `-DryRun` switch before a live run.
4. Keep secrets in DPAPI files or environment variables. Do not put a secret in
   a script.
5. Do not put machinery in the vault or the synchronized folder.
6. Do not add a database. See section 4.4.
7. Complete one stage before you start the next stage.
8. Keep the classification prompt in a separate file.
9. Keep the 26-capture corpus. Use the corpus as a regression test after each
   prompt change.

---

## 14. Current state summary

Everything through Stage 5 is complete and live, plus Lists, Capture, and
Re-enrich (all originally spec'd in 10.4/10.5 but not built until now) and
Vault, Search, Chat, the New note view, the Tandoor and Seerr pushes,
Unarchive, and Share (none of which were in the original plan - 10.4, 10.5,
9.2, 9.3). Chat is also the one place the interface calls the Gemini API
directly (3.3), and re-enrich and New note are the two other places the
interface writes into `queue\pending\` alongside the processor (10.6) -
everything else the original plan describes is unchanged. Digest email
(Stage 6, section 11) is the one thing
not yet built.

Also not in the original plan: the Inbox's important/star toggle was
replaced outright by Pin (10.5) - there is no `important` field any more,
only `pinned` - and the Inbox itself picked up a welcome header/greeting,
Pinned/To review grouping, a hamburger drawer nav on phone screens, a
desktop two-pane split view, and art slots for `media`/`recipe` items (all
10.4) - originally placeholder-only, now backed by a real TMDB poster/
backdrop for `media` and a search-found dish photo for `recipe` (9.2, 9.3),
falling back to the placeholder when no image is available.

For what shipped and when, read CHANGELOG.md, not this section - it updates
itself on every merge and was staying accurate long after this table
stopped being maintained by hand. Home Assistant and Sonarr/Radarr
integration remain not planned for this version (1.4).
