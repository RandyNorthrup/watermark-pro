/**
 * Collects image files from a folder input or a folder drop, keeping each
 * file's path within the folder so the ZIP can preserve the tree. The drag
 * path walks the `webkitGetAsEntry` filesystem entries recursively; the input
 * path reads `webkitRelativePath`. Non-images are skipped and counted, the
 * batch is capped, and recursion is depth-limited so a pathological tree
 * cannot hang the browser.
 */

/** One image to process, with its path within the chosen folder (or its bare name). */
export interface BulkFile {
  file: File
  relativePath: string
}

/** The result of collecting files: the images kept and how many non-images were skipped. */
export interface FolderScan {
  files: BulkFile[]
  skipped: number
}

export const MAX_BULK_FILES = 500
export const MAX_FOLDER_DEPTH = 32

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** `webkitRelativePath` when a folder input set it, else the bare file name. */
function relativePathOf(file: File): string {
  // Typed `string` by lib.dom, but empty for a plain file and absent in jsdom.
  const path = (file as { webkitRelativePath?: string }).webkitRelativePath
  return path === undefined || path === '' ? file.name : path
}

/** Images from a plain file list (the "Add photos" or "Add a folder" input). */
export function collectImages(files: readonly File[]): FolderScan {
  const kept: BulkFile[] = []
  let skipped = 0
  for (const file of files) {
    if (kept.length >= MAX_BULK_FILES) {
      break
    }
    if (isImage(file)) {
      kept.push({ file, relativePath: relativePathOf(file) })
    } else {
      skipped += 1
    }
  }
  return { files: kept, skipped }
}

/** The minimal shape of a filesystem entry we walk (drag-and-drop of folders). */
export interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath?: string
  file?: (onSuccess: (file: File) => void, onError: (error: unknown) => void) => void
  createReader?: () => FileSystemDirectoryReaderLike
}

export interface FileSystemDirectoryReaderLike {
  readEntries: (
    onSuccess: (entries: FileSystemEntryLike[]) => void,
    onError: (error: unknown) => void,
  ) => void
}

function entryFile(entry: FileSystemEntryLike): Promise<File | null> {
  const read = entry.file
  if (read === undefined) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    read(
      (file) => {
        resolve(file)
      },
      () => {
        resolve(null)
      },
    )
  })
}

/** A directory reader returns entries in batches; read until it returns none. */
async function readAllEntries(
  reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  const all: FileSystemEntryLike[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
      reader.readEntries(
        (entries) => {
          resolve(entries)
        },
        () => {
          resolve([])
        },
      )
    })
    if (batch.length === 0) {
      break
    }
    all.push(...batch)
  }
  return all
}

/** Recursively collects images from dropped filesystem entries, tree preserved. */
export async function readEntries(entries: readonly FileSystemEntryLike[]): Promise<FolderScan> {
  const kept: BulkFile[] = []
  let skipped = 0

  async function walk(entry: FileSystemEntryLike, depth: number): Promise<void> {
    if (kept.length >= MAX_BULK_FILES || depth > MAX_FOLDER_DEPTH) {
      return
    }
    if (entry.isFile) {
      const file = await entryFile(entry)
      if (file === null) {
        return
      }
      if (isImage(file)) {
        const path = (entry.fullPath ?? entry.name).replace(/^\/+/, '')
        kept.push({ file, relativePath: path === '' ? entry.name : path })
      } else {
        skipped += 1
      }
      return
    }
    if (entry.isDirectory && entry.createReader !== undefined) {
      const children = await readAllEntries(entry.createReader())
      for (const child of children) {
        if (kept.length >= MAX_BULK_FILES) {
          break
        }
        await walk(child, depth + 1)
      }
    }
  }

  for (const entry of entries) {
    if (kept.length >= MAX_BULK_FILES) {
      break
    }
    await walk(entry, 0)
  }
  return { files: kept, skipped }
}

/** The ZIP entry path for one output: the source folder plus the resolved file name. */
export function zipPath(relativePath: string, fileName: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash === -1 ? fileName : `${relativePath.slice(0, slash + 1)}${fileName}`
}

/** Whether this browser can offer a folder-picking input. */
export function canPickDirectory(): boolean {
  return 'webkitdirectory' in HTMLInputElement.prototype
}
