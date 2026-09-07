/**
 * Editor document and its undo history. The document is plain data so the
 * reducer is testable without React; continuous gestures (drags, slider
 * sweeps) call `checkpoint` once at the start so one undo reverts the whole
 * gesture rather than every intermediate frame.
 */
import type { CropRect } from './geometry'
import type { WatermarkSpec } from '../../shared/watermark'
import type { Size } from '../engine/layout'

/** One mark on the photo: a library preset and this photo's adjustments to it. */
export interface Layer {
  /** Stable within a document so the active layer survives reordering and undo. */
  id: string
  spec: WatermarkSpec
  /** Library preset the spec came from, for the "modified" indicator. */
  presetId: string
}

export interface EditorDocument {
  /** Crop in source pixels; `null` keeps the whole photo. */
  crop: CropRect | null
  /** Output size after cropping; `null` keeps the cropped size. */
  resize: Size | null
  /** Marks in drawing order; later layers paint over earlier ones. Empty until a preset is chosen. */
  layers: Layer[]
}

/** Layers a document may carry; beyond this the photo is a collage, not a watermark. */
export const MAX_LAYERS = 8

/** A layer for a preset, with an id no other layer will get. */
export function createLayer(presetId: string, spec: WatermarkSpec): Layer {
  return { id: crypto.randomUUID(), presetId, spec }
}

/** The document with one layer replaced in place. */
export function withLayer(document: EditorDocument, layer: Layer): EditorDocument {
  return {
    ...document,
    layers: document.layers.map((candidate) => (candidate.id === layer.id ? layer : candidate)),
  }
}

export function withoutLayer(document: EditorDocument, layerId: string): EditorDocument {
  return { ...document, layers: document.layers.filter((layer) => layer.id !== layerId) }
}

export interface EditorHistory {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
}

export const HISTORY_LIMIT = 50

export const EMPTY_DOCUMENT: EditorDocument = {
  crop: null,
  resize: null,
  layers: [],
}

export type EditorAction =
  /** Replaces the document without touching history (mid-gesture updates). */
  | { type: 'set'; document: EditorDocument }
  /** Records the present so the next `set` can be undone as one step. */
  | { type: 'checkpoint' }
  /** Checkpoint and set in one step, for discrete controls. */
  | { type: 'commit'; document: EditorDocument }
  | { type: 'undo' }
  | { type: 'redo' }
  /** New photo or preset: history restarts. */
  | { type: 'reset'; document: EditorDocument }

export function createHistory(document: EditorDocument = EMPTY_DOCUMENT): EditorHistory {
  return { past: [], present: document, future: [] }
}

function isSameDocument(a: EditorDocument, b: EditorDocument): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function pushPast(history: EditorHistory): EditorDocument[] {
  const past = [...history.past, history.present]
  return past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past
}

export function editorReducer(history: EditorHistory, action: EditorAction): EditorHistory {
  switch (action.type) {
    case 'set': {
      return { ...history, present: action.document }
    }
    case 'checkpoint': {
      const last = history.past.at(-1)
      if (last !== undefined && isSameDocument(last, history.present)) {
        return history
      }
      return { past: pushPast(history), present: history.present, future: [] }
    }
    case 'commit': {
      if (isSameDocument(history.present, action.document)) {
        return history
      }
      return { past: pushPast(history), present: action.document, future: [] }
    }
    case 'undo': {
      const previous = history.past.at(-1)
      if (previous === undefined) {
        return history
      }
      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      }
    }
    case 'redo': {
      const [next, ...rest] = history.future
      if (next === undefined) {
        return history
      }
      return { past: [...history.past, history.present], present: next, future: rest }
    }
    case 'reset': {
      return createHistory(action.document)
    }
  }
}

export function canUndo(history: EditorHistory): boolean {
  return history.past.length > 0
}

export function canRedo(history: EditorHistory): boolean {
  return history.future.length > 0
}
