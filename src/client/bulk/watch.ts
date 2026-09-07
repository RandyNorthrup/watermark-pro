/**
 * Watch-folder scanning (Chromium desktop, File System Access API). Pure
 * scanner logic so it can be tested in jsdom against a fake directory handle:
 * `scanDirectory` lists the image files in a folder, `diffScans` reports which
 * of them are new or changed since the last scan, and `writeOutput` writes a
 * result file into the chosen output folder. The polling loop and the browser
 * handles live in the UI.
 */

export const WATCH_INTERVAL_MS = 5000

/** A file's identity for change detection: a rename, resize or re-save is a new entry. */
export interface ScanEntry {
  name: string
  size: number
  lastModified: number
}

export interface FileHandleLike {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

export interface DirectoryHandleLike {
  kind: 'directory'
  entries: () => AsyncIterableIterator<[string, FileHandleLike | DirectoryHandleLike]>
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WritableFileHandleLike>
}

export interface WritableFileHandleLike {
  createWritable: () => Promise<WritableStreamLike>
}

export interface WritableStreamLike {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

/** One image found in the watched folder, with its handle-read `File`. */
export interface ScannedFile {
  entry: ScanEntry
  file: File
}

function keyOf(entry: ScanEntry): string {
  return `${entry.name}:${String(entry.size)}:${String(entry.lastModified)}`
}

/** Every image file directly inside the folder (top level only). */
export async function scanDirectory(directory: DirectoryHandleLike): Promise<ScannedFile[]> {
  const found: ScannedFile[] = []
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== 'file') {
      continue
    }
    const file = await handle.getFile()
    if (!file.type.startsWith('image/')) {
      continue
    }
    found.push({ entry: { name, size: file.size, lastModified: file.lastModified }, file })
  }
  return found
}

/** The entries in `current` that are new or changed since `previous`. */
export function diffScans(
  previous: readonly ScanEntry[],
  current: readonly ScanEntry[],
): ScanEntry[] {
  const seen = new Set(previous.map((entry) => keyOf(entry)))
  return current.filter((entry) => !seen.has(keyOf(entry)))
}

/** Writes a result blob into the output folder under `name` (created or replaced). */
async function writeOutput(output: DirectoryHandleLike, name: string, blob: Blob): Promise<void> {
  const handle = await output.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

/** How one processed file is reported back to the UI log. */
export interface SweepReport {
  wrote: (name: string) => void
  failed: (name: string, error: unknown) => void
}

/**
 * Processes the files in `input` that are new since `seen`: each is handed to
 * `process`, the result written to `output`, and progress reported. Files
 * already seen are skipped and a single file's failure is reported without
 * stopping the sweep. Returns the entries to remember for the next sweep.
 */
export async function sweepFolder(
  input: DirectoryHandleLike,
  output: DirectoryHandleLike,
  seen: readonly ScanEntry[],
  process: (file: File) => Promise<{ fileName: string; blob: Blob }>,
  report: SweepReport,
): Promise<ScanEntry[]> {
  const scanned = await scanDirectory(input)
  const fresh = new Set(
    diffScans(
      seen,
      scanned.map((item) => item.entry),
    ).map((entry) => keyOf(entry)),
  )
  for (const item of scanned) {
    if (!fresh.has(keyOf(item.entry))) {
      continue
    }
    try {
      const result = await process(item.file)
      await writeOutput(output, result.fileName, result.blob)
      report.wrote(result.fileName)
    } catch (error) {
      report.failed(item.entry.name, error)
    }
  }
  return scanned.map((item) => item.entry)
}

/** Whether this browser can watch a folder (File System Access + not mobile). */
export function canWatchFolder(isMobile: boolean): boolean {
  return !isMobile && 'showDirectoryPicker' in globalThis
}
