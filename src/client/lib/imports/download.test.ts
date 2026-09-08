import { describe, expect, it } from 'vitest'

import { toImageFile } from './download'

describe('toImageFile', () => {
  it('keeps the provider-supplied name and type', () => {
    const file = toImageFile(
      new Blob(['x'], { type: 'application/octet-stream' }),
      'photo.png',
      'image/png',
    )
    expect(file.name).toBe('photo.png')
    expect(file.type).toBe('image/png')
  })

  it('falls back to the blob type when no type is supplied', () => {
    const file = toImageFile(new Blob(['x'], { type: 'image/jpeg' }), 'photo.jpg')
    expect(file.type).toBe('image/jpeg')
  })

  it('falls back to the blob type when the supplied type is empty', () => {
    const file = toImageFile(new Blob(['x'], { type: 'image/webp' }), 'photo.webp', '')
    expect(file.type).toBe('image/webp')
  })

  it('carries the bytes through', async () => {
    const file = toImageFile(new Blob(['hello'], { type: 'image/png' }), 'photo.png')
    expect(await file.text()).toBe('hello')
  })
})
