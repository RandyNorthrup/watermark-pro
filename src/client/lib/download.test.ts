import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadBlob } from './download'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadBlob', () => {
  it('clicks a temporary download link and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      const anchor = document.querySelector('a[download]')
      expect(anchor).toHaveAttribute('href', 'blob:fake')
      expect(anchor).toHaveAttribute('download', 'photo.png')
      expect(anchor).toHaveAttribute('rel', 'noopener')
    })

    downloadBlob(new Blob(['x'], { type: 'image/png' }), 'photo.png')

    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
