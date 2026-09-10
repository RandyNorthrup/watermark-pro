/** Owns the object URL for one private, possibly offline, media file. */
import { useEffect, useState } from 'react'

import { hasOfflineDatabase } from './offline-context'
import { loadWorkspaceMedia } from './offline-media'

export function useWorkspaceMedia(organizationId: string, path: string | null): string | undefined {
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (path === null || !hasOfflineDatabase()) {
      return
    }
    let isDisposed = false
    let url: string | undefined
    void loadWorkspaceMedia(organizationId, path)
      .then((blob) => {
        if (isDisposed) {
          return
        }
        url = URL.createObjectURL(blob)
        setResolved({ path, url })
      })
      .catch(() => {
        // Retain the original URL so the browser exposes the image's accessible
        // alternative text on failure; API authorization errors are never cached.
        if (!isDisposed) {
          setResolved({ path, url: path })
        }
      })
    return () => {
      isDisposed = true
      if (url !== undefined) {
        URL.revokeObjectURL(url)
      }
    }
  }, [organizationId, path])
  if (!hasOfflineDatabase()) {
    return path ?? undefined
  }
  return resolved?.path === path ? resolved.url : undefined
}
