import { useCallback, useEffect, useRef, useState } from 'react'

import type { WatermarkSpec } from '../../../shared/watermark'
import type { Transform } from '../../engine/pipeline'
import { apiRequest } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { PreviewRenderer, type PreviewResult } from '../../lib/preview'

/** Slider drags fire continuously; one render per pause keeps the worker responsive. */
export const RENDER_DEBOUNCE_MS = 120

function parseTransform(key: string): Transform | undefined {
  const parsed: unknown = JSON.parse(key)
  return parsed === null ? undefined : parsed
}

export interface RendererState {
  result: PreviewResult | null
  isRendering: boolean
  error: string | null
}

/**
 * Owns a `PreviewRenderer` for the lifetime of a component and re-renders
 * whenever the spec or transform changes. The renderer is also handed back
 * so callers can swap the subject or export at full size.
 */
export function useRenderer(
  organizationId: string,
  spec: WatermarkSpec | null,
  transform: Transform | undefined,
) {
  const rendererRef = useRef<PreviewRenderer | null>(null)
  const [state, setState] = useState<RendererState>({
    result: null,
    isRendering: false,
    error: null,
  })
  const [subjectVersion, setSubjectVersion] = useState(0)

  useEffect(() => {
    const renderer = new PreviewRenderer(async (assetId) => {
      const response = await apiRequest(assetFileUrl(organizationId, assetId))
      return await response.blob()
    })
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [organizationId])

  // Serialised so a structurally equal transform does not trigger a re-render.
  const transformKey = JSON.stringify(transform ?? null)
  useEffect(() => {
    if (spec === null) {
      return
    }
    const currentTransform = parseTransform(transformKey)
    async function renderFrame(renderer: PreviewRenderer, current: WatermarkSpec) {
      try {
        const next = await renderer.render(current, { transform: currentTransform })
        if (next === null) {
          return
        }
        setState({ result: next, isRendering: false, error: null })
      } catch (error_) {
        setState((previous) => ({
          ...previous,
          isRendering: false,
          error: describeError(error_),
        }))
      }
    }
    const timer = setTimeout(() => {
      const renderer = rendererRef.current
      if (renderer === null) {
        return
      }
      setState((previous) => ({ ...previous, isRendering: true }))
      void renderFrame(renderer, spec)
    }, RENDER_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [spec, transformKey, subjectVersion])

  // Each object URL lives until the next result replaces it or the component unmounts.
  const url = state.result?.url
  useEffect(
    () => () => {
      if (url !== undefined) {
        URL.revokeObjectURL(url)
      }
    },
    [url],
  )

  const setSubject = useCallback(async (file: Blob | null) => {
    const renderer = rendererRef.current
    if (renderer === null) {
      return
    }
    try {
      await renderer.setSubject(file)
      setSubjectVersion((version) => version + 1)
    } catch (error_) {
      setState((previous) => ({ ...previous, error: describeError(error_) }))
    }
  }, [])

  return { ...state, renderer: rendererRef, setSubject }
}
