import { describe, expect, it } from 'vitest'

import {
  canRedo,
  canUndo,
  createHistory,
  createLayer,
  type EditorDocument,
  editorReducer,
  EMPTY_DOCUMENT,
  HISTORY_LIMIT,
  withAdjustments,
  withLayer,
  withoutLayer,
  withOrientation,
} from './state'
import { IDENTITY_ADJUSTMENTS, IDENTITY_ORIENTATION } from '../../shared/adjustments'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

function withCrop(width: number): EditorDocument {
  return { ...EMPTY_DOCUMENT, crop: { x: 0, y: 0, width, height: width } }
}

describe('editor history', () => {
  it('commits discrete changes and walks them back and forth', () => {
    let history = createHistory()
    expect(canUndo(history)).toBe(false)
    history = editorReducer(history, { type: 'commit', document: withCrop(100) })
    history = editorReducer(history, { type: 'commit', document: withCrop(200) })
    expect(history.present.crop?.width).toBe(200)
    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(false)

    history = editorReducer(history, { type: 'undo' })
    expect(history.present.crop?.width).toBe(100)
    expect(canRedo(history)).toBe(true)
    history = editorReducer(history, { type: 'undo' })
    expect(history.present).toBe(EMPTY_DOCUMENT)
    expect(editorReducer(history, { type: 'undo' })).toBe(history)

    history = editorReducer(history, { type: 'redo' })
    history = editorReducer(history, { type: 'redo' })
    expect(history.present.crop?.width).toBe(200)
    expect(editorReducer(history, { type: 'redo' })).toBe(history)
  })

  it('treats a checkpoint plus many sets as one undoable gesture', () => {
    const layer = createLayer('p1', DEFAULT_TEXT_SPEC)
    let history = createHistory({ ...EMPTY_DOCUMENT, layers: [layer] })
    history = editorReducer(history, { type: 'checkpoint' })
    for (const width of [10, 20, 30, 40]) {
      history = editorReducer(history, { type: 'set', document: withCrop(width) })
    }
    expect(history.past).toHaveLength(1)
    expect(history.present.crop?.width).toBe(40)
    history = editorReducer(history, { type: 'undo' })
    expect(history.present.crop).toBeNull()
    expect(history.present.layers[0]?.presetId).toBe('p1')
    expect(history.future[0]?.crop?.width).toBe(40)
  })

  it('ignores no-op commits and duplicate checkpoints, and clears redo on new work', () => {
    let history = createHistory()
    history = editorReducer(history, { type: 'commit', document: { ...EMPTY_DOCUMENT } })
    expect(history.past).toHaveLength(0)
    history = editorReducer(history, { type: 'checkpoint' })
    history = editorReducer(history, { type: 'checkpoint' })
    expect(history.past).toHaveLength(1)

    history = editorReducer(history, { type: 'commit', document: withCrop(50) })
    history = editorReducer(history, { type: 'undo' })
    expect(canRedo(history)).toBe(true)
    history = editorReducer(history, { type: 'commit', document: withCrop(60) })
    expect(canRedo(history)).toBe(false)
  })

  it('replaces and removes layers by id with fresh ids per layer', () => {
    const first = createLayer('p1', DEFAULT_TEXT_SPEC)
    const second = createLayer('p2', DEFAULT_TEXT_SPEC)
    expect(first.id).not.toBe(second.id)
    const document = { ...EMPTY_DOCUMENT, layers: [first, second] }
    const moved = {
      ...second,
      spec: { ...second.spec, style: { ...second.spec.style, scale: 0.5 } },
    }
    const replaced = withLayer(document, moved)
    expect(replaced.layers).toEqual([first, moved])
    expect(withoutLayer(replaced, first.id).layers).toEqual([moved])
    expect(withoutLayer(replaced, 'nobody').layers).toEqual([first, moved])
  })

  it('resets the crop when the photo is turned, keeps it when only straightened to fit', () => {
    const source = { width: 400, height: 200 }
    const cropped: EditorDocument = {
      ...EMPTY_DOCUMENT,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      resize: { width: 50, height: 50 },
    }
    const turned = withOrientation(cropped, { ...IDENTITY_ORIENTATION, turns: 1 }, source)
    expect(turned.crop).toBeNull()
    expect(turned.resize).toBeNull()
    expect(turned.orientation.turns).toBe(1)

    const nudged = withOrientation(cropped, { ...IDENTITY_ORIENTATION, straighten: 5 }, source)
    expect(nudged.crop).toEqual(cropped.crop)

    const overTilted = withOrientation(cropped, { ...IDENTITY_ORIENTATION, straighten: 45 }, source)
    expect(overTilted.crop).toBeNull()
  })

  it('sets colour adjustments without touching anything else', () => {
    const next = withAdjustments(EMPTY_DOCUMENT, { ...IDENTITY_ADJUSTMENTS, brightness: 0.5 })
    expect(next.adjust.brightness).toBe(0.5)
    expect(next.layers).toBe(EMPTY_DOCUMENT.layers)
  })

  it('caps the past at the history limit and resets on a new photo', () => {
    let history = createHistory()
    for (let index = 1; index <= HISTORY_LIMIT + 10; index += 1) {
      history = editorReducer(history, { type: 'commit', document: withCrop(index + 16) })
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    history = editorReducer(history, { type: 'reset', document: EMPTY_DOCUMENT })
    expect(history).toEqual(createHistory())
  })
})
