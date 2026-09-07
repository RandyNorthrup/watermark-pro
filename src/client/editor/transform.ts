/**
 * Builds the engine `Transform` from an editor document, omitting the fields
 * that are at their identity so a plain photo renders with no transform at
 * all. Shared by the live preview, export and gallery save.
 */
import type { EditorDocument } from './state'
import { isIdentityAdjustments, isIdentityOrientation } from '../../shared/adjustments'
import type { Transform } from '../engine/pipeline'

export function documentTransform(document: EditorDocument): Transform | undefined {
  const transform: Transform = {}
  if (!isIdentityOrientation(document.orientation)) {
    transform.orientation = document.orientation
  }
  if (document.crop !== null) {
    transform.crop = document.crop
  }
  if (document.resize !== null) {
    transform.resize = document.resize
  }
  if (!isIdentityAdjustments(document.adjust)) {
    transform.adjust = document.adjust
  }
  return Object.keys(transform).length === 0 ? undefined : transform
}

/**
 * The transform to render while cropping shows the oriented, adjusted photo
 * without the crop or resize applied, so the crop frame is drawn over the
 * whole frame it selects from.
 */
export function previewTransform(
  document: EditorDocument,
  isCropping: boolean,
): Transform | undefined {
  if (!isCropping) {
    return documentTransform(document)
  }
  return documentTransform({ ...document, crop: null, resize: null })
}
