import { describe, expect, it } from 'vitest'

import { type EditorDocument, EMPTY_DOCUMENT } from './state'
import { documentTransform, previewTransform } from './transform'
import { IDENTITY_ADJUSTMENTS, IDENTITY_ORIENTATION } from '../../shared/adjustments'

describe('documentTransform', () => {
  it('is undefined for an untouched document', () => {
    expect(documentTransform(EMPTY_DOCUMENT)).toBeUndefined()
  })

  it('includes only the non-identity fields', () => {
    expect(
      documentTransform({ ...EMPTY_DOCUMENT, orientation: { ...IDENTITY_ORIENTATION, turns: 1 } }),
    ).toEqual({ orientation: { ...IDENTITY_ORIENTATION, turns: 1 } })

    expect(
      documentTransform({ ...EMPTY_DOCUMENT, crop: { x: 1, y: 2, width: 3, height: 4 } }),
    ).toEqual({ crop: { x: 1, y: 2, width: 3, height: 4 } })

    expect(
      documentTransform({ ...EMPTY_DOCUMENT, adjust: { ...IDENTITY_ADJUSTMENTS, sepia: 0.5 } }),
    ).toEqual({ adjust: { ...IDENTITY_ADJUSTMENTS, sepia: 0.5 } })
  })

  it('keeps orientation and adjustments while dropping the crop during cropping', () => {
    const document: EditorDocument = {
      ...EMPTY_DOCUMENT,
      orientation: { ...IDENTITY_ORIENTATION, turns: 2 },
      crop: { x: 1, y: 2, width: 3, height: 4 },
      resize: { width: 5, height: 6 },
      adjust: { ...IDENTITY_ADJUSTMENTS, contrast: 0.2 },
    }
    expect(previewTransform(document, true)).toEqual({
      orientation: { ...IDENTITY_ORIENTATION, turns: 2 },
      adjust: { ...IDENTITY_ADJUSTMENTS, contrast: 0.2 },
    })
    expect(previewTransform(document, false)).toEqual(documentTransform(document))
  })
})
