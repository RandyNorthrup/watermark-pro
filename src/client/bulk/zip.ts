/**
 * Builds a ZIP archive of already-encoded images. Images do not compress,
 * so entries are stored (`ZipPassThrough`) rather than deflated; the stream
 * API keeps peak memory at one entry plus the collected chunks, which
 * become the Blob without another copy.
 */
import { Zip, ZipPassThrough } from 'fflate'

export interface ZipEntry {
  name: string
  blob: Blob
}

/** Stops a duplicate name from silently overwriting an earlier entry. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count === 0) {
      return name
    }
    const dot = name.lastIndexOf('.')
    return dot > 0
      ? `${name.slice(0, dot)} (${String(count)})${name.slice(dot)}`
      : `${name} (${String(count)})`
  })
}

export async function zipEntries(entries: readonly ZipEntry[]): Promise<Blob> {
  const chunks: Uint8Array[] = []
  const finished = new Promise<void>((resolve, reject) => {
    const zip = new Zip((error, chunk, isFinal) => {
      if (error !== null) {
        reject(error)
        return
      }
      chunks.push(chunk)
      if (isFinal) {
        resolve()
      }
    })
    void appendAll(zip, entries).catch((error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
  await finished
  return new Blob(chunks as BlobPart[], { type: 'application/zip' })
}

async function appendAll(zip: Zip, entries: readonly ZipEntry[]): Promise<void> {
  const names = uniqueNames(entries.map((entry) => entry.name))
  for (const [index, entry] of entries.entries()) {
    const file = new ZipPassThrough(names[index] ?? entry.name)
    file.mtime = new Date()
    zip.add(file)
    file.push(new Uint8Array(await entry.blob.arrayBuffer()), true)
  }
  zip.end()
}
