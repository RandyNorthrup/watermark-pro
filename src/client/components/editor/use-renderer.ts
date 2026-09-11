import { useCallback, useEffect, useRef, useState } from 'react'

import { usePreviewFrames } from './use-preview-frames'
import type { PhotoMetadata } from '../../../shared/metadata'
import type { WatermarkSpec } from '../../../shared/watermark'
import type { Size } from '../../engine/layout'
import type { Transform } from '../../engine/pipeline'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { PreviewRenderer, type PreviewResult } from '../../lib/preview'

export interface RendererState {
  result: PreviewResult | null
  isRendering: boolean
  error: string | null
}

/**
 * Owns a `PreviewRenderer` for the lifetime of a component and re-renders
 * whenever the marks or transform change (an empty list renders the photo
 * alone). The renderer is also handed back so callers can swap the subject
 * or export at full size.
 */
export function useRenderer(
  organizationId: string,
  specs: readonly WatermarkSpec[],
  transform: Transform | undefined,
  outputSize: Size,
  isEnabled = true,
) {
  const rendererRef = useRef<PreviewRenderer | null>(null)
  const [state, setState] = useState<RendererState>({
    result: null,
    isRendering: false,
    error: null,
  })
  const subjectRequest = useRef(0)
  const [subjectVersion, setSubjectVersion] = useState(0)

  useEffect(() => {
    const renderer = new PreviewRenderer(async (assetId) => {
      return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
    })
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [organizationId])

  const frames = usePreviewFrames(
    rendererRef,
    specs,
    { transform, output: outputSize },
    `${organizationId}:${String(subjectVersion)}`,
    isEnabled,
  )

  const setSubject = useCallback(
    async (file: File | null, metadata: PhotoMetadata | null = null) => {
      const renderer = rendererRef.current
      if (renderer === null) {
        return
      }
      subjectRequest.current += 1
      const request = subjectRequest.current
      try {
        await renderer.setSubject(file, metadata)
        if (rendererRef.current === renderer && request === subjectRequest.current)
          setSubjectVersion((version) => version + 1)
      } catch (error_) {
        if (rendererRef.current !== renderer || request !== subjectRequest.current) return
        setState((previous) => ({ ...previous, error: describeError(error_) }))
      }
    },
    [],
  )

  return { ...frames, error: state.error ?? frames.error, renderer: rendererRef, setSubject }
}
