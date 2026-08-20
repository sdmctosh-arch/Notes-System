# Note Capture and Enrichment System

Specification and build plan.
Document version 1.0. Date 2026-08-18.

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

Part 3 does not call the Gemini API. All API keys stay on the server.

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
  "media_type": null,
  "timing": null,
  "proposed_automation": null,
  "approved_automation": null,
  "ambiguity_note": null,
  "captured": "2026-08-11T13:30:10-04:00",
  "created": "2026-08-18T16:08:22-04:00",
  "status": "pending",
  "capture_path": "E:\\notes\\Archive\\Captures\\2026-08-11-13-30-10-pm.md",
  "enrichment": null,
  "processor_version": "0.2"
}
```

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

Values of `kind`: `answer`, `page_summary`, `media_info`, `recipe`, `none`.

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

Status: **built and validated in a sandbox**. Script:
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

### 8.4b Keeping the interface container up to date

`scripts\Update-Container.ps1` checks `origin/main` on a schedule and, only
when there is actually something new, pulls and runs
`docker compose up -d --build`. It never touches a working tree with
uncommitted changes, and every failure - including Docker not running -
lands in `E:\notes-system\logs\update-container-<date>.log` rather than
being silent.

Test it with `-DryRun` first: it fetches and reports whether an update is
available without pulling or rebuilding anything.

| Item | Value |
|---|---|
| Program | `C:\Program Files\PowerShell\7\pwsh.exe` |
| Arguments | `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\Steven\Documents\GitHub\Notes-System\scripts\Update-Container.ps1"` |
| Repeat | Every hour (or whatever cadence fits) |
| "Run whether user is logged on or not" | Checked |

Unlike the note processor, this script never touches the DPAPI key - git and
docker don't need it - so the task can run whether anyone is logged in or
not, which is the point: it keeps working even when nobody's at the machine
to run `git pull` by hand. Docker Desktop's own "Start Docker Desktop when
you sign in" setting only starts it on login, though - if the goal is
updates landing even across a reboot with nobody logging in at all, Docker
Desktop also needs its own "Start Docker Desktop when you log in" replaced
with a service-level autostart, which is a Docker Desktop setting, not
something this script controls.

This was tested against a sandboxed clone with a controlled, deliberately
out-of-date `origin/main` (not the real repo or `E:\notes-system`) - the
git side (up-to-date detection, the actual pull, the dirty-tree skip, the
lock file and its stale-lock takeover) all confirmed correct. The
`docker compose up -d --build` step itself could only be exercised as far
as confirming it fails loudly and cleanly when Docker isn't reachable, since
there was no Docker daemon available to build against in that sandbox -
verify the full pull-and-rebuild path once for real on the deployment
machine.

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
| `todo` | None | `none` |
| `project` | None | `none` |
| `idea` | None | `none` |
| `grocery` | None | `none` |
| `unclassified` | None | `none` |

Rules:
- Enrichment failure is not a capture failure. Set `status` to `enrich_failed`.
  Keep the item in the queue.
- Store citations as data. Do not store citations only inside the text.
- If the URL is a YouTube link, extract the video identifier. Put the identifier
  in `enrichment.embed`.

### 9.3 Recipe conversion

Convert a recipe item to a schema.org/Recipe object at processing time. Put the
object in `enrichment.structured`.

Required properties: `name`, `recipeIngredient`, `recipeInstructions`.
Optional properties: `description`, `recipeYield`, `prepTime`, `cookTime`,
`totalTime`, `recipeCategory`, `recipeCuisine`.

Use ISO 8601 duration format for times. Example: `PT30M`.

This object is the input for a future Tandoor import. Do not build the Tandoor
integration now.

### 9.4 Code guards

These guards do not depend on model behavior. Do not remove them.

| Guard | Rule |
|---|---|
| Automation allowlist | Remove `automation_candidate` unless the category is in `$AutomationAllowedCategories` **and** the value is in `$AllowedAutomations`. `$AllowedAutomations` is empty. Record the proposed value in `proposed_automation` |
| URL validation | A URL is valid only if it is absolute, has scheme `http` or `https`, and contains no white space. Put an invalid value in `url_rejected` |
| Content hash | Compare the SHA-256 of the normalized body against the ledger. Do not process a repeat |
| Truncation | If `truncated` is `true`, file the **original** body text. Do not file the model output |

---

## 10. Part 3: web interface

Status: **to build**.

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
| Port | 8080 on the LAN only |

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

**Item card.** The content changes with the category.

| Category | Card content |
|---|---|
| `lookup` | The question. The answer. Citation links |
| `reference` | The page title. The summary. Citation links. A YouTube player if the URL is a video |
| `media` | The title, type, and year. A poster image is not required |
| `recipe` | The recipe name. Ingredients. Steps |
| `todo`, `project`, `idea` | The title and the body |
| `unclassified` | The title, the body, and the `ambiguity_note` |

**Lists.** One view for each of `media`, `todo`, and `grocery`. These lists are
the input for a future integration.

**Archive.** Shows items with status `archived`, `filed`, or `dismissed`.
Read only. Include a search field.

**Capture.** Shows the original Markdown file for an item. Read only.

### 10.5 Actions

| Action | Effect |
|---|---|
| Keep in vault | Write a Markdown file to the correct vault folder. Set `status` to `filed`. Move the queue file to `archived\` |
| Archive | Set `status` to `archived`. Move the queue file to `archived\` |
| Dismiss | Set `status` to `dismissed`. Move the queue file to `archived\` |
| Change category | Change `category`. Keep `status` as it is |
| Edit title or body | Change the field. Do not change the original capture |
| Re-enrich | Write a request file. The processor enriches the item on the next run |

The interface must not call the Gemini API. Re-enrichment is a request to the
processor.

### 10.6 File safety rules

- Write to a temporary file. Then rename the file. Do not write in place.
- The processor creates files in `queue\pending\` only.
- The interface moves files from `queue\pending\` to `queue\archived\` only.
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

Build one stage at a time. Do not start a stage until the previous test passes.

### Stage 1. Enrichment in the processor

Add pass 2 to `Invoke-NoteProcessor-v2.ps1`.

**Test.** Process the 26-capture corpus in a sandbox. Each `lookup` item has an
answer and at least one citation. Each `reference` item has a summary. Each
`recipe` item has a valid schema.org/Recipe object. No capture is lost.

### Stage 2. Backend API

Build the FastAPI service. Endpoints: list items, get one item, update one item,
move one item.

**Test.** Read the sandbox queue through the API. Change one item status. Confirm
the file moved to `archived\`.

### Stage 3. Frontend

Build the React interface. Build the Inbox view and the item card first.

**Test.** Open the interface in a phone browser and a desktop browser. Review
one item of each category. Confirm the YouTube player works.

### Stage 4. Container

Write the Dockerfile and the Compose file. Add authentication.

**Test.** Start the container. Open the interface from another device on the
LAN. Confirm the password is required.

### Stage 5. Live operation

Point the processor at `E:\notes`. Point the container at the real queue.

**Test.** Capture a note on the phone. Confirm the note appears in the interface
in less than 10 minutes.

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

| Component | State |
|---|---|
| MacroDroid capture | Complete |
| Syncthing transport | Complete |
| Processor file lifecycle | Complete. Validated in a sandbox |
| Classification | Complete. 26 of 26 correct |
| Code guards | Complete |
| Enrichment | Not started |
| Web interface | Not started |
| Digest email | Not started |
| Tandoor import | Not planned for this version |
| Home Assistant integration | Not planned for this version |
| Sonarr and Radarr integration | Not planned for this version |

### 14.1 Open items

- One capture, `2026-08-11-06-13-06-am.md`, has no frontmatter. The file fails
  on each run. Add a frontmatter block or delete the file.
- The live ledger contains 26 identifiers from an earlier test script. These
  captures will not process again. To process them, rename the ledger and copy
  the archived captures to `processing\`.
