import { describe, expect, it } from 'vitest'

import {
  canRedo,
  canUndo,
  createHistory,
  type EditorDocument,
  editorReducer,
  EMPTY_DOCUMENT,
  HISTORY_LIMIT,
} from './state'
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
    let history = createHistory({ ...EMPTY_DOCUMENT, spec: DEFAULT_TEXT_SPEC, presetId: 'p1' })
    history = editorReducer(history, { type: 'checkpoint' })
    for (const width of [10, 20, 30, 40]) {
      history = editorReducer(history, { type: 'set', document: withCrop(width) })
    }
    expect(history.past).toHaveLength(1)
    expect(history.present.crop?.width).toBe(40)
    history = editorReducer(history, { type: 'undo' })
    expect(history.present.crop).toBeNull()
    expect(history.present.presetId).toBe('p1')
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
