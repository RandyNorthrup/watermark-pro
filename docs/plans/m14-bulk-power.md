# M14 — Bulk power: per-photo override, folders, renaming, pause, watch folder, batch report

## Goal

Watermarkly, Visual Watermark, iWatermark+ and Simply Entertaining let a
user fix one photo inside a batch without leaving it; eZy users switch to
single mode and complain. uMark takes folders with sub-folders, keeps the
tree, renames on export, and pauses. No product watches a folder. After
M14 the bulk tool does all of that: any photo in a batch can be opened in
the editor and given its own marks, crop and adjustments; folders are
accepted with their tree preserved in the ZIP; output names follow a
pattern; a running batch can pause; on Chromium desktop a folder can be
watched and processed as files arrive; and every batch ends with a report.

Research: `docs/competitor-research.md` §1.4 (Batch), §3.2 (per-image
override, folder input, rename).

## Behaviour

### Per-photo override

Each row in "Photos in this batch" gets an "Adjust" button (icon
`SlidersHorizontal`, label "Adjust {name}"). It opens a full-screen dialog
(`ui/sheet.tsx` side `bottom` on phones, a centred dialog at ≥ md) that
hosts the existing editor in _embedded_ mode:

- Same tabs (Watermark, Crop, Adjust, Resize) minus Export.
- Starts from the batch's settings: the ticked presets as layers in
  ticked order, the batch orientation/adjustments/frame, no crop, the
  batch resize (`fitLongestSide` translated to a resize for this photo).
- Footer: "Apply to this photo", "Apply to all photos" (copies the layers
  and adjustments, not the crop, into the batch settings and clears every
  other override), "Remove override" (when one exists), "Cancel".
- A row with an override shows a "Custom" badge; its output is produced
  from the override document instead of the batch settings, and only that
  job re-runs when the override changes (the rest of the batch keeps its
  results).

The bulk page keeps working with 500 photos: the editor dialog is mounted
only while open (`React.lazy` for the editor chunk is already the case for
the editor route; reuse `Editor` from the same chunk).

### Folders

- "Add a folder" button next to "Add photos" (`<input type="file"
webkitdirectory>`; hidden on browsers without `webkitdirectory` support
  detection via `'webkitdirectory' in HTMLInputElement.prototype`).
- Drag-and-drop of folders: `DataTransferItem.webkitGetAsEntry()` recursion
  (`readDirectory` in `src/client/bulk/folders.ts`, depth ≤ 32, files
  ≤ `MAX_BULK_FILES` = 500 as today, non-images skipped and counted:
  "12 files skipped: not images").
- Each file keeps its `relativePath` (`webkitRelativePath` or the entry's
  `fullPath` without the leading slash, or the bare name). The ZIP uses it,
  with the output name applied to the file part, so the tree is preserved.
  Single downloads use the file part only.

### Output names

A "File names" field in the output settings with a pattern, default
`{name}-watermarked`, tokens `{name}` (source name without extension),
`{index}` (1-based, zero-padded to the batch's digit count), `{count}`,
`{date}` (capture date or last-modified, `YYYY-MM-DD`), `{preset}` (name of
the first ticked preset, slugified), `{width}`, `{height}`. Validation:
non-empty after resolution; characters outside `[A-Za-z0-9 ._()-]` are
replaced by `-`; duplicates inside the batch get ` (2)`, ` (3)` as today
(`uniqueNames`). Constant `DEFAULT_NAME_PATTERN`; `resolveNamePattern` in
`src/client/bulk/names.ts`, pure and unit tested.

### Pause and resume

`JobQueue` gains `pause()` and `resume()`: pause stops dequeuing new jobs;
running jobs finish. The Cancel button becomes a split: "Pause" (turns into
"Resume") and "Cancel". `QueueSnapshot` gains `isPaused`.

### Watch folder (Chromium desktop only)

Behind feature detection (`'showDirectoryPicker' in window` and
`!isMobile`): a "Watch a folder" card under the batch. The user picks an
input folder and an output folder (two `showDirectoryPicker` calls with
`mode: 'read'` and `mode: 'readwrite'`); the tool then scans the input
folder every `WATCH_INTERVAL_MS = 5000`, processes every new image file
(by name + size + lastModified key) with the ticked presets and current
settings, writes the result into the output folder through
`createWritable()`, and lists what it did. Stop button; the watch ends
when the page unloads (no background processing; say so in the UI). Not
offered on Safari/Firefox (no API). Unit tests use a fake directory handle
(`test-support/fake-file-system.ts`) so the scanner logic (`watch.ts`,
`scanDirectory`, `diffScans`) is covered in jsdom; a browser test in
Chromium exercises `createWritable` on an in-memory OPFS directory
(`navigator.storage.getDirectory()`), which has the same interface.

### Batch report

When a batch settles, a summary line and a "Download report" link: a CSV
(`report.csv`) with `source,relative_path,output,status,width,height,
duration_ms,error,presets,override` for every job. Built by
`src/client/bulk/report.ts` (pure, tested), downloaded with the existing
`download` helper. The toast text: "20 of 20 finished in 4.1 s · 0 failed
· 2 custom".

## Data model

```ts
// src/client/bulk/queue.ts
export interface BulkJobInput {
  file: File
  relativePath: string
  metadata: PhotoMetadata        // from M13
  override: EditorDocument | null
}
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export interface QueueSnapshot<Input, Output> { jobs; isRunning; isPaused; isSettled }

// src/client/bulk/processor.ts
export interface BulkSettings {
  output: EncodeOptions
  fitLongestSide: number | null
  orientation: …; adjust: …; border: …   // M11/M12
  namePattern: string
}
```

`BulkRuntime.run(input: BulkJobInput, specs, settings, signal, position: { index, count })`
picks the override document when present: layers → specs (tokens
resolved per photo as today), document transform → `Transform`, output
from the batch settings (format, quality, metadata policy). Otherwise the
batch path as today.

## Files

New: `src/client/bulk/folders.ts` (+ test with fake entries),
`src/client/bulk/names.ts` (+ test), `src/client/bulk/report.ts` (+ test),
`src/client/bulk/watch.ts` (+ tests), `src/client/test-support/fake-file-system.ts`,
`src/client/components/bulk/override-dialog.tsx`,
`src/client/components/bulk/watch-folder.tsx`,
`src/client/components/bulk/name-pattern-field.tsx`.

Modified: `queue.ts` (pause/resume, `rerun(id)`, typed input),
`processor.ts`, `runtime.ts`, `zip.ts` (nested paths: fflate's `zipSync`
takes `a/b/c.png` keys as directories already; `uniqueNames` works per
directory), `use-bulk-queue.ts` (overrides map, `setOverride(id,
document | null)`, `pause`, `resume`, `rerun`), `bulk-tool.tsx` (rows,
buttons, folder input, name pattern, report), `editor.tsx` (embedded mode:
props `mode: 'page' | 'embedded'`, `onCommit`, `onCancel`,
`initialDocument`; the export panel is hidden in embedded mode),
`app-shell.tsx` (nothing), README, CHANGELOG.

## Tests

Unit: `readDirectory` flattens nested fake entries with paths, skips
non-images, stops at the file cap with a counted remainder;
`resolveNamePattern` for every token, padding, sanitising, empty result
error; `report.ts` CSV escaping (quotes, commas, newlines in errors);
`JobQueue` pause keeps running jobs, resume continues, `rerun(id)`
replaces one job's result; `diffScans` finds new and changed files only.

Page (`bulk-page.test.tsx`): Adjust opens the dialog with the ticked
presets as layers; "Apply to this photo" stores the override and the fake
runtime receives the override document for that job only; "Apply to all"
changes the batch specs and clears overrides; a folder input with
`webkitRelativePath` values yields nested ZIP entry names; name pattern
`{index}-{name}` gives `01-one.jpg`; Pause/Resume; report download called
with a CSV blob whose header matches.

Browser: the watch scanner against OPFS writes an output file for a file
added between two scans and skips it on the third scan.

e2e (`e2e/bulk.spec.ts`, all projects): add three photos, set the pattern
`{index}-{name}`, adjust the second photo (move its mark to a corner via
the Corner placement choice, apply), start, download the ZIP: names
`1-shot-01-…`, the second photo's mark region differs from the first's
(sample the top-left corner block's mean colour in Node: one has the mark,
the other not). Desktop-chrome only, in addition: drag a folder is not
automatable; the `webkitdirectory` input is set with
`setInputFiles` on a directory path (Playwright supports directories) and
the ZIP contains `folder/shot.png`.

Red drills:

| Name                                              | Mutation                                             | Command                      |
| ------------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| Override: batch settings used despite an override | `run` ignores `input.override`                       | unit-client `bulk-page.test` |
| Override: applying to one photo re-runs the batch | `setOverride` calls `start()` instead of `rerun(id)` | unit-client `bulk-page.test` |
| Folders: tree flattened in the ZIP                | ZIP keys use the file part only                      | unit-client `bulk-page.test` |
| Names: `{index}` not zero-padded                  | padding removed                                      | unit `names.test`            |
| Names: unsafe characters kept                     | sanitiser returns input                              | unit `names.test`            |
| Pause: new jobs still start while paused          | `#dequeue` ignores `#isPaused`                       | unit `queue.test`            |
| Watch: already-processed files processed again    | `diffScans` returns every file                       | unit `watch.test`            |
| Report: errors with commas break the CSV          | escaping removed                                     | unit `report.test`           |

## Docs

README "Bulk watermarking" rewritten around: presets, per-photo override,
folders, names, pause, report, watch folder (Chromium); CHANGELOG; PLAN
§5.5 no change; SECURITY.md: watch folder writes only into the folder the
user picked, through the browser's permission prompt; nothing leaves the
device.

## Security and privacy

The File System Access API is permission-gated by the browser per folder
and per session; the app never stores handles (no IndexedDB persistence of
handles in this milestone, so no silent access later). Output files are
written only under the chosen output folder with names from
`resolveNamePattern` (sanitised: no path separators).

## Certification checklist

- [ ] gates, eight drills red, Lighthouse, screenshots (override dialog on
      phone and desktop; watch-folder card on desktop)
- [ ] the 500-photo page still renders under 1 s after adding files (page
      test with 500 fake files asserts the list is virtualised or paged:
      render at most 60 rows and "Show all")
- [ ] version 1.6.0, tag, deploy, release
