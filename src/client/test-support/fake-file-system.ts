/**
 * In-memory File System Access handles for the watch-folder tests. Implements
 * just the slice of the API the scanner uses: listing entries, reading files,
 * and writing output files (kept in `written` for assertions).
 */
import type { DirectoryHandleLike, FileHandleLike, WritableFileHandleLike } from '../bulk/watch'

function fileHandle(name: string, file: File): FileHandleLike {
  return {
    kind: 'file',
    name,
    getFile: () => Promise.resolve(file),
  }
}

export class FakeDirectory implements DirectoryHandleLike {
  readonly #files = new Map<string, File>()
  readonly kind = 'directory'
  /** Output written through `getFileHandle`, by name, for assertions. */
  readonly written = new Map<string, Blob>()
  /** When set, `entries()` throws, standing in for a folder that can no longer be read. */
  fail = false

  /** Adds (or replaces) an input file in the folder. */
  put(name: string, file: File): void {
    this.#files.set(name, file)
  }

  async *entries(): AsyncIterableIterator<[string, FileHandleLike | DirectoryHandleLike]> {
    await Promise.resolve()
    if (this.fail) {
      throw new Error('cannot read the folder')
    }
    for (const [name, file] of this.#files) {
      yield [name, fileHandle(name, file)]
    }
  }

  getFileHandle(name: string): Promise<WritableFileHandleLike> {
    return Promise.resolve({
      createWritable: () =>
        Promise.resolve({
          write: (data: Blob) => {
            this.written.set(name, data)
            return Promise.resolve()
          },
          close: () => Promise.resolve(),
        }),
    })
  }
}

/** An image `File` with a chosen modified time. */
export function imageFile(name: string, lastModified: number, bytes = 1): File {
  const file = new File([new Uint8Array(bytes)], name, { type: 'image/png' })
  Object.defineProperty(file, 'lastModified', { value: lastModified })
  return file
}
