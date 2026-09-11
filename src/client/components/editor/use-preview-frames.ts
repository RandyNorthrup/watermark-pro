import { type RefObject, useEffect, useRef, useState } from 'react'

import { describeError } from '../../lib/errors'
import type { PreviewRenderer, PreviewResult, RenderOptions, SpecInput } from '../../lib/preview'
import { PreviewFrames } from '../../lib/preview-frames'

interface FrameInput {
  specs: SpecInput
  options: RenderOptions
}

/** Shared backpressure for pointer, keyboard, form and slider preview changes. */
export function usePreviewFrames(
  rendererRef: RefObject<PreviewRenderer | null>,
  specs: SpecInput,
  options: RenderOptions,
  identity: string,
  isEnabled = true,
) {
  const [state, setState] = useState({
    identity: '',
    result: null as PreviewResult | null,
    isRendering: false,
    error: null as string | null,
  })
  const queue = useRef<PreviewFrames<FrameInput, PreviewResult | null> | null>(null)
  useEffect(() => {
    const renderer = rendererRef.current
    if (renderer === null || !isEnabled) return
    const frames = new PreviewFrames<FrameInput, PreviewResult | null>(
      async (input) => {
        setState((previous) => ({ ...previous, isRendering: true }))
        return await renderer.render(input.specs, input.options)
      },
      (result) => {
        if (result === null) {
          setState((previous) => ({ ...previous, isRendering: false }))
        } else {
          setState({ identity, result, isRendering: false, error: null })
        }
      },
      (error: unknown) => {
        setState((previous) => ({ ...previous, isRendering: false, error: describeError(error) }))
      },
      (result) => {
        if (result !== null) URL.revokeObjectURL(result.url)
      },
    )
    queue.current = frames
    return () => {
      frames.dispose()
      queue.current = null
    }
  }, [rendererRef, identity, isEnabled])

  const inputKey = JSON.stringify({ specs, options })
  useEffect(() => {
    // This JSON was produced from typed local state immediately above.
    const input = JSON.parse(inputKey) as FrameInput
    queue.current?.request(input)
  }, [inputKey, identity, isEnabled])

  const url = state.result?.url
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url)
    },
    [url],
  )
  return state.identity === identity
    ? state
    : { result: null, isRendering: state.isRendering, error: state.error }
}
