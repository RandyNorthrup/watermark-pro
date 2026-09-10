import { Image, Stamp } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { WatermarkDto } from '../../../shared/api-watermark'
import type { RecentWorkItem } from '../../../shared/recent-work'
import { photoThumbnailUrl } from '../../lib/gallery'
import { assetFileUrl } from '../../lib/library'
import { captureOfflineOwner } from '../../lib/offline-context'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { useWorkspaceMedia } from '../../lib/use-workspace-media'

/** A preview uses the real saved content, never a fabricated project image. */
export function RecentThumbnail({ item }: { item: RecentWorkItem }) {
  return item.kind === 'photo' ? (
    <PhotoThumbnail organizationId={item.photo.organizationId} id={item.photo.id} />
  ) : (
    <PresetThumbnail preset={item.preset} />
  )
}

function PhotoThumbnail({ organizationId, id }: { organizationId: string; id: string }) {
  const url = useWorkspaceMedia(organizationId, photoThumbnailUrl(organizationId, id))
  const [failed, setFailed] = useState(false)
  return url === undefined || failed ? (
    <Image aria-hidden="true" className="size-8 text-ink-muted" />
  ) : (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  )
}

function PresetThumbnail({ preset }: { preset: WatermarkDto }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const owner = captureOfflineOwner()
    let wasCancelled = false
    const isCancelled = () => wasCancelled
    let release: (() => void) | undefined
    let imageUrl: string | undefined
    async function render() {
      try {
        const { PreviewRenderer } = await import('../../lib/preview')
        owner.assertCurrent()
        if (isCancelled()) return
        const renderer = new PreviewRenderer((id) =>
          loadWorkspaceMedia(preset.organizationId, assetFileUrl(preset.organizationId, id)),
        )
        release = () => renderer.dispose()
        const preview = await renderer.render(preset.spec)
        if (preview !== null) imageUrl = preview.url
        owner.assertCurrent()
        if (preview === null) return
        if (isCancelled()) {
          URL.revokeObjectURL(preview.url)
          imageUrl = undefined
          return
        }
        setUrl(preview.url)
      } catch {
        if (imageUrl !== undefined) {
          URL.revokeObjectURL(imageUrl)
          imageUrl = undefined
        }
        // The filename and type remain usable when a logo/font is not yet
        // available offline; opening the preset exposes its normal error UI.
      } finally {
        release?.()
        release = undefined
      }
    }
    void render()
    return () => {
      wasCancelled = true
      release?.()
      if (imageUrl !== undefined) URL.revokeObjectURL(imageUrl)
    }
  }, [preset])
  return url === null ? (
    <Stamp aria-hidden="true" className="size-8 text-ink-muted" />
  ) : (
    <img src={url} alt="" className="h-full w-full object-contain" />
  )
}
