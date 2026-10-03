/** Owns the object URL for one private, possibly offline, media file. */
import { useEffect, useState } from 'react'

import { hasOfflineDatabase } from './offline-context'
import { loadWorkspaceMedia } from './offline-media'

/** Own the URL for caller-authorized original bytes, or resolve this account's private media path. */
export function useWorkspaceMedia(
  organizationId: string,
  path: string | null,
  original?: Blob,
): string | undefined {
  const [resolved, setResolved] = useState<{
    path: string
    url: string
    original: Blob | undefined
  } | null>(null)
  useEffect(() => {
    if (path === null || (original === undefined && !hasOfflineDatabase())) {
      return
    }
    let isDisposed = false
    let url: string | undefined
    // A caller that already checked access owns these bytes; do not repeat that
    // request while a real network outage may leave its transport unresolved.
    void (
      original === undefined ? loadWorkspaceMedia(organizationId, path) : Promise.resolve(original)
    )
      .then((blob) => {
        if (isDisposed) {
          return
        }
        url = URL.createObjectURL(blob)
        setResolved({ path, url, original })
      })
      .catch(() => {
        // Retain the original URL so the browser exposes the image's accessible
        // alternative text on failure; API authorization errors are never cached.
        if (!isDisposed) {
          setResolved({ path, url: path, original })
        }
      })
    return () => {
      isDisposed = true
      if (url !== undefined) {
        URL.revokeObjectURL(url)
      }
    }
  }, [organizationId, path, original])
  if (original === undefined && !hasOfflineDatabase()) {
    return path ?? undefined
  }
  return resolved?.path === path && resolved.original === original ? resolved.url : undefined
}
