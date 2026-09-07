import { afterEach, describe, expect, it, vi } from 'vitest'

import { canShareFiles, shareFile } from './share-file'

const PNG = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

describe('share-file', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports no file sharing without the API or when the browser refuses files', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareFiles('image/png')).toBe(false)
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false })
    expect(canShareFiles('image/png')).toBe(false)
    vi.stubGlobal('navigator', { share: vi.fn() })
    expect(canShareFiles('image/png')).toBe(false)
  })

  it('shares the file with its name and type, and treats a dismissed sheet as not shared', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve())
    const canShare = vi.fn((data: ShareData) => (data.files?.[0]?.type ?? '') === 'image/png')
    vi.stubGlobal('navigator', { share, canShare })
    expect(canShareFiles('image/png')).toBe(true)
    expect(canShareFiles('image/webp')).toBe(false)
    expect(await shareFile(PNG, 'photo-watermarked.png')).toBe('shared')
    const shared = share.mock.calls[0]?.[0]
    expect(shared?.title).toBe('photo-watermarked.png')
    expect(shared?.files?.[0]?.name).toBe('photo-watermarked.png')
    expect(shared?.files?.[0]?.type).toBe('image/png')

    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    expect(await shareFile(PNG, 'photo.png')).toBe('dismissed')
    share.mockRejectedValueOnce(new Error('no targets'))
    await expect(shareFile(PNG, 'photo.png')).rejects.toThrow('no targets')
  })

  it('throws when the API is missing altogether', async () => {
    vi.stubGlobal('navigator', {})
    await expect(shareFile(PNG, 'photo.png')).rejects.toThrow(/cannot share/)
  })
})
