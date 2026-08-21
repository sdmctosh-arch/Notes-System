# Note Capture and Enrichment System

Read `docs/PROJECT.md` before you start work. It is the specification. Read only
the sections for the current stage.

## What this project is

Three parts that communicate through files only:

1. Capture — MacroDroid on Android writes Markdown. Syncthing copies it to the
   server. **Complete. Do not change.**
2. Processing — PowerShell 7 on Windows. Classifies and enriches. Writes JSON.
3. Interface — Docker container. React and FastAPI. Reads and writes the JSON.

No part calls another part directly.

## Hard rules

1. **Never write to `E:\notes` or `E:\notes-system` during development.** Use a
   sandbox path. These directories hold the user's real notes.
2. **Never commit secrets.** The API key is a DPAPI file at
   `E:\notes-system\gemini.key.xml`. It is not in the repository.
3. **No database.** JSON files only. A database file on an NTFS bind mount can
   become corrupt. See PROJECT.md section 4.4.
4. **PowerShell 7 for server tasks.** Use bash only if a tool requires it.
5. **Do not remove the code guards** in PROJECT.md section 9.4. They exist
   because the model produced bad output in testing.
6. **One stage at a time.** Do not start the next stage until its test passes.
   Stages are in PROJECT.md section 12.
7. **Add a `-DryRun` switch to every script that writes files.**
8. **Update `docs/PROJECT.md` in the same PR as the change it affects.** Status
   lines, data formats, view/action descriptions - whatever the change makes
   true or untrue. Unlike CHANGELOG.md (auto-appended on merge, pure history,
   never needs rewriting), PROJECT.md is a living spec that gets edited in
   place, and that can't be automated the same way - deciding what changed
   and how to state it takes understanding the diff, not just appending a
   summary. Catching this after the fact, across several merges, is exactly
   how PROJECT.md drifted before.

## PowerShell errors to avoid

These occurred in this project. Do not repeat them.

- PowerShell unrolls a collection on return. Use `return ,$hashSet` for a
  `HashSet`. Wrap a call in `@()` when you expect an array.
- A `Mandatory` `[string[]]` parameter rejects an empty string element. Add
  `[AllowEmptyString()]` and `[AllowEmptyCollection()]`.
- Read files with `Get-Content -Raw`, then split the text. The array form
  behaves differently on files with one line.
- `Move-Item` fails when the target exists. Use a unique-path function for a
  new file. To deliberately overwrite an existing file (an atomic update),
  use `Move-Item -Force` instead - it does overwrite. Don't use
  `[IO.File]::Replace($tmp, $target, $null)` for this: on this project's
  platform it throws "The value cannot be an empty string (Parameter
  'path')" when the backup path is `$null`, even though `$null` is meant to
  mean "no backup."
- The script targets `pwsh.exe`, not `powershell.exe`.

## Testing

`test-corpus/` holds 26 real captures. Use it as a regression test after any
change to the prompt or the classifier.

## Style

Write comments that explain why, not what. State the reason when code works
around model behavior.

## Communication style
Use ASD-STE-100 when you speak to the operator.
