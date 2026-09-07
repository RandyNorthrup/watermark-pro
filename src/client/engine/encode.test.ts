import { describe, expect, it } from 'vitest'

import { encodeCanvas } from './encode'
import { domBackend } from '../test-support/fake-canvas-backend'

const canvas = () => domBackend.createCanvas(4, 4)

describe('encodeCanvas', () => {
  it('rejects a quality outside 0–1', async () => {
    await expect(encodeCanvas(canvas(), { format: 'image/jpeg', quality: 2 })).rejects.toThrow(
      RangeError,
    )
  })

  it('refuses an invisible mark on a lossy format', async () => {
    await expect(
      encodeCanvas(canvas(), { format: 'image/jpeg', quality: 0.9, invisible: { message: 'hi' } }),
    ).rejects.toThrow(/PNG/)
  })

  it('allows an invisible mark on a PNG', async () => {
    const blob = await encodeCanvas(canvas(), {
      format: 'image/png',
      quality: 1,
      invisible: { message: 'hi' },
    })
    expect(blob.type).toBe('image/png')
  })
})
