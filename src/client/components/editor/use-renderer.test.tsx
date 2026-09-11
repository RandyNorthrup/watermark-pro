import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useRenderer } from './use-renderer'
import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { PreviewRenderer } from '../../lib/preview'

vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))

const callbacks = new Map<number, FrameRequestCallback>()
let sequence = 0
beforeEach(() => {
  callbacks.clear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    sequence += 1
    callbacks.set(sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  Object.assign(URL, { revokeObjectURL: vi.fn() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function nextFrame() {
  await act(async () => {
    const batch = callbacks.values().toArray()
    callbacks.clear()
    for (const callback of batch) callback(0)
    // Let the resolved renderer job publish its frame inside React act.
    await Promise.resolve()
  })
}

it('coalesces text, style and photo-transform inputs through the shared renderer and clears old account frames', async () => {
  const render = vi.spyOn(PreviewRenderer.prototype, 'render')
  const { result, rerender } = renderHook(
    ({ owner, text, opacity, width }) =>
      useRenderer(
        owner,
        [{ ...DEFAULT_TEXT_SPEC, text, style: { ...DEFAULT_TEXT_SPEC.style, opacity } }],
        { resize: { width, height: 200 } },
        { width, height: 200 },
      ),
    { initialProps: { owner: 'workspace-a', text: 'first', opacity: 1, width: 300 } },
  )
  for (let index = 1; index <= 100; index += 1)
    rerender({
      owner: 'workspace-a',
      text: `Text ${String(index)}`,
      opacity: index / 100,
      width: 300 + index,
    })
  expect(render).not.toHaveBeenCalled()
  await nextFrame()
  expect(render).toHaveBeenCalledTimes(1)
  expect(render.mock.calls[0]?.[0]).toMatchObject([{ text: 'Text 100', style: { opacity: 1 } }])
  expect(render.mock.calls[0]?.[1]?.transform?.resize).toEqual({ width: 400, height: 200 })
  expect(result.current.result?.width).toBe(400)
  rerender({ owner: 'workspace-b', text: 'Private B', opacity: 1, width: 500 })
  expect(result.current.result).toBeNull()
  await nextFrame()
  expect(result.current.result?.width).toBe(500)
})

it('reports render failure and recovers on the next real control change', async () => {
  vi.spyOn(PreviewRenderer.prototype, 'render').mockRejectedValueOnce(new Error('preview failed'))
  const { result, rerender } = renderHook(
    ({ text }) =>
      useRenderer('workspace', [{ ...DEFAULT_TEXT_SPEC, text }], undefined, {
        width: 300,
        height: 200,
      }),
    { initialProps: { text: 'first' } },
  )
  await nextFrame()
  await waitFor(() => expect(result.current.error).toBe('preview failed'))
  rerender({ text: 'retry with new input' })
  await nextFrame()
  expect(result.current.error).toBeNull()
  expect(result.current.result).not.toBeNull()
})
