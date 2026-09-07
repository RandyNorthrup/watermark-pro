/**
 * Editor document and its undo history. The document is plain data so the
 * reducer is testable without React; continuous gestures (drags, slider
 * sweeps) call `checkpoint` once at the start so one undo reverts the whole
 * gesture rather than every intermediate frame.
 */
import type { CropRect } from './geometry'
import {
  type Adjustments,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  type Orientation,
} from '../../shared/adjustments'
import type { WatermarkSpec } from '../../shared/watermark'
import type { Size } from '../engine/layout'
import { orientedFrame } from '../engine/orient'

/** One mark on the photo: a library preset and this photo's adjustments to it. */
export interface Layer {
  /** Stable within a document so the active layer survives reordering and undo. */
  id: string
  spec: WatermarkSpec
  /** Library preset the spec came from, for the "modified" indicator. */
  presetId: string
}

export interface EditorDocument {
  /** Quarter turns, flips and straighten, applied before the crop. */
  orientation: Orientation
  /** Crop in oriented-and-straightened pixel space; `null` keeps the whole frame. */
  crop: CropRect | null
  /** Output size after cropping; `null` keeps the cropped size. */
  resize: Size | null
  /** Colour adjustments applied to the whole photo. */
  adjust: Adjustments
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

/** Whether a crop still lies inside the oriented frame at a new orientation. */
export function isCropWithinFrame(crop: CropRect, source: Size, orientation: Orientation): boolean {
  const frame = orientedFrame(source, orientation)
  return (
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.x + crop.width <= frame.width &&
    crop.y + crop.height <= frame.height
  )
}

/**
 * Sets the orientation. Turning or flipping invalidates any crop and resize
 * (the frame changes shape); straightening keeps a crop that still fits.
 */
export function withOrientation(
  document: EditorDocument,
  orientation: Orientation,
  source: Size,
): EditorDocument {
  const previous = document.orientation
  const isTurnedOrFlipped =
    orientation.turns !== previous.turns ||
    orientation.flipX !== previous.flipX ||
    orientation.flipY !== previous.flipY
  const shouldKeepCrop =
    !isTurnedOrFlipped &&
    document.crop !== null &&
    isCropWithinFrame(document.crop, source, orientation)
  return {
    ...document,
    orientation,
    crop: shouldKeepCrop ? document.crop : null,
    resize: isTurnedOrFlipped ? null : document.resize,
  }
}

/** Sets the colour adjustments. */
export function withAdjustments(document: EditorDocument, adjust: Adjustments): EditorDocument {
  return { ...document, adjust }
}

export interface EditorHistory {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
}

export const HISTORY_LIMIT = 50

export const EMPTY_DOCUMENT: EditorDocument = {
  orientation: IDENTITY_ORIENTATION,
  crop: null,
  resize: null,
  adjust: IDENTITY_ADJUSTMENTS,
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
