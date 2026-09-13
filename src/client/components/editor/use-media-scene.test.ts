import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useMediaScene } from './use-media-scene'
import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { MAX_LAYERS } from '../../editor/state'
import { blankSpec, defaultSpecFor } from '../../lib/spec-edit'
import { makeWatermark } from '../../test-support/fake-library-api'
import { createVideoMotion, putVideoKeyframe } from '../../video/motion'

const ANIMATED = putVideoKeyframe(
  { ...createVideoMotion(10), fadeIn: 1, fadeOut: 2 },
  { time: 4, x: 0.3, y: 0.7, scale: 0.2, rotation: 35, opacity: 0.8 },
)

describe('inline media scene history', () => {
  it('keeps an animated draft on the same timeline when saved, including undo and redo', () => {
    const { result } = renderHook(() => useMediaScene(true))
    const saved = makeWatermark({ spec: { ...DEFAULT_TEXT_SPEC, text: 'Client Proof' } })
    act(() => result.current.changeSpec(saved.spec))
    act(() => result.current.change({ ...result.current.value, animations: { draft: ANIMATED } }))
    act(() => result.current.saveDraft(saved))
    const id = result.current.value.activeId
    expect(id).not.toBe('draft')
    expect(result.current.outputSpecs).toEqual([saved.spec])
    expect(result.current.renderLayers).toHaveLength(1)
    expect(result.current.value.animations).toEqual({ [String(id)]: ANIMATED })
    act(() => result.current.undo())
    expect(result.current.value.activeId).toBe('draft')
    expect(result.current.value.animations).toEqual({ draft: ANIMATED })
    act(() => result.current.redo())
    expect(result.current.value.activeId).toBe(id)
    expect(result.current.value.animations).toEqual({ [String(id)]: ANIMATED })
  })

  it('starts another clip with the same marks and fresh timing, without old-clip undo', () => {
    const { result } = renderHook(() => useMediaScene(true))
    act(() => result.current.saveDraft(makeWatermark()))
    const layers = result.current.value.layers
    const activeId = result.current.value.activeId
    act(() =>
      result.current.change({
        ...result.current.value,
        animations: { [String(activeId)]: ANIMATED },
      }),
    )
    act(() => result.current.replaceSource())
    expect(result.current.value.layers).toEqual(layers)
    expect(result.current.value.activeId).toBe(activeId)
    expect(result.current.value.animations).toEqual({})
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.value.animations).toEqual({})
    act(() => result.current.newScene())
    expect(result.current.value.layers).toEqual([])
    expect(result.current.outputSpecs).toEqual([blankSpec()])
  })

  it('can clear, undo, and type a new visible draft without reviving removed layers', () => {
    const { result } = renderHook(() => useMediaScene(true))
    act(() => result.current.addPreset(makeWatermark()))
    act(() => result.current.clear())
    expect(result.current.outputSpecs).toEqual([])
    act(() => result.current.undo())
    expect(result.current.outputSpecs).toEqual([makeWatermark().spec])
    act(() => result.current.redo())
    act(() => result.current.changeSpec({ ...DEFAULT_TEXT_SPEC, text: 'New Draft' }))
    expect(result.current.value.layers).toEqual([])
    expect(result.current.value.activeId).toBe('draft')
    expect(result.current.outputSpecs).toEqual([expect.objectContaining({ text: 'New Draft' })])
  })

  it('groups a continuous move, scale and rotation into one reversible change', () => {
    const { result } = renderHook(() => useMediaScene(true))
    const initial = result.current.value.draft
    act(() => result.current.gesture('draft', { phase: 'start', patch: {} }))
    act(() =>
      result.current.gesture('draft', {
        phase: 'move',
        patch: { x: 0.4, y: 0.6, scale: 0.3, rotation: 45 },
      }),
    )
    act(() => result.current.gesture('draft', { phase: 'move', patch: { x: 0.5, y: 0.7 } }))
    act(() => result.current.gesture('draft', { phase: 'end', patch: {} }))
    expect(result.current.value.draft.placement).toEqual({ mode: 'custom', x: 0.5, y: 0.7 })
    expect(result.current.value.draft.style).toMatchObject({ scale: 0.3, rotation: 45 })
    act(() => result.current.undo())
    expect(result.current.value.draft).toEqual(initial)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.gesture('missing', { phase: 'commit', patch: { rotation: 90 } }))
    expect(result.current.value.draft).toEqual(initial)
    expect(result.current.canRedo).toBe(true)
  })

  it('keeps other layer timing when replacing a draft and removes timing with its layer', () => {
    const { result } = renderHook(() => useMediaScene(true))
    act(() => result.current.addPreset(makeWatermark()))
    const first = result.current.value.layers[0]
    if (first === undefined) throw new Error('Expected the first mark')
    act(() => result.current.newPreset())
    act(() =>
      result.current.change({
        ...result.current.value,
        animations: { [first.id]: ANIMATED, draft: createVideoMotion(8) },
      }),
    )
    act(() => result.current.useTemplate({ ...DEFAULT_TEXT_SPEC, text: 'DRAFT' }))
    expect(result.current.value.animations).toEqual({ [first.id]: ANIMATED })
    act(() => result.current.addPreset(makeWatermark({ id: 'second' })))
    const second = result.current.value.layers[1]
    if (second === undefined) throw new Error('Expected the second mark')
    expect(result.current.value.animations[second.id]).toBeUndefined()
    act(() => result.current.select(first.id))
    act(() => result.current.changeSpec({ ...DEFAULT_TEXT_SPEC, text: 'Updated First' }))
    expect(result.current.value.layers[0]?.spec).toMatchObject({ text: 'Updated First' })
    expect(result.current.value.layers[1]?.spec).toEqual(second.spec)
    act(() => result.current.removeLayer(first.id))
    expect(result.current.value.animations).toEqual({})
    expect(result.current.value.activeId).toBe(second.id)
    act(() => result.current.removeLayer(second.id))
    expect(result.current.outputSpecs).toEqual([])
    expect(result.current.value.activeId).toBeNull()
  })

  it('does not export a partial scene while a logo is missing and respects the layer limit', () => {
    const { result } = renderHook(() => useMediaScene(true))
    act(() => result.current.addPreset(makeWatermark()))
    act(() => result.current.newPreset())
    act(() => result.current.changeSpec(defaultSpecFor('image', DEFAULT_TEXT_SPEC)))
    expect(result.current.renderLayers).toHaveLength(1)
    expect(result.current.outputSpecs).toEqual([])
    for (let index = 1; index < MAX_LAYERS; index += 1)
      act(() => result.current.addPreset(makeWatermark({ id: String(index) })))
    const full = result.current.value.layers
    act(() => result.current.addPreset(makeWatermark({ id: 'over-limit' })))
    act(() => result.current.saveDraft(makeWatermark({ id: 'over-limit-draft' })))
    expect(result.current.value.layers).toEqual(full)
    expect(result.current.value.layers).toHaveLength(MAX_LAYERS)
  })

  it('allows a read-only member to use existing presets without showing an unsaved draft', () => {
    const { result } = renderHook(() => useMediaScene(false))
    expect(result.current.renderLayers).toEqual([])
    act(() => result.current.addPreset(makeWatermark()))
    expect(result.current.outputSpecs).toEqual([makeWatermark().spec])
    act(() => result.current.clear())
    act(() => result.current.changeSpec(DEFAULT_TEXT_SPEC))
    expect(result.current.renderLayers).toEqual([])
    expect(result.current.canUndo).toBe(true)
  })
})
