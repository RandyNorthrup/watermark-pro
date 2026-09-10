import { describe, expect, it } from 'vitest'

import { chooseContrast, hexLuminance, INK, resolveContrast } from './contrast'
import { qrMatrix } from './qr'

describe('hexLuminance', () => {
  it('spans black to white with green counting most', () => {
    expect(hexLuminance('#000000')).toBe(0)
    expect(hexLuminance('#ffffff')).toBeCloseTo(1, 3)
    expect(hexLuminance('#808080')).toBeCloseTo(0.216, 2)
    expect(hexLuminance('#00ff00')).toBeGreaterThan(hexLuminance('#ff0000'))
    expect(hexLuminance('#ff0000')).toBeGreaterThan(hexLuminance('#0000ff'))
    expect(hexLuminance('#FFFFFF')).toBe(hexLuminance('#ffffff'))
  })
})

describe('resolveContrast', () => {
  it('uses the stock ink for auto and manual settings', () => {
    const bright = resolveContrast({ mode: 'auto' }, 0.9)
    expect(bright).toEqual({ ...chooseContrast(0.9), fill: INK.dark.fill })
    expect(bright.variant).toBe('dark')
    const manual = resolveContrast({ mode: 'manual', variant: 'light', outline: 0.3 }, 0.9)
    expect(manual).toEqual({ variant: 'light', fill: INK.light.fill, outline: 0.3, isAuto: false })
  })

  it('keeps a chosen colour as the ink and picks the outline tone from its luminance', () => {
    const navy = resolveContrast({ mode: 'colour', colour: '#1e3a8a', outline: 0.5 }, 0.2)
    expect(navy).toEqual({ variant: 'dark', fill: '#1e3a8a', outline: 0.5, isAuto: false })
    const cream = resolveContrast({ mode: 'colour', colour: '#fef3c7', outline: 0.1 }, 0.9)
    expect(cream.variant).toBe('light')
    expect(cream.fill).toBe('#fef3c7')
  })
})

describe('qrMatrix', () => {
  it('encodes content into a square with the three finder patterns', () => {
    const matrix = qrMatrix('https://lumafoil.com/share/abc')
    // Versions are 21 modules plus four per step.
    expect((matrix.size - 21) % 4).toBe(0)
    expect(matrix.size).toBeGreaterThanOrEqual(21)
    for (const [row, column] of [
      [0, 0],
      [0, matrix.size - 1],
      [matrix.size - 1, 0],
      [3, 3],
    ]) {
      expect(matrix.isDark(row ?? 0, column ?? 0)).toBe(true)
    }
    // The ring inside each finder pattern is light.
    expect(matrix.isDark(1, 1)).toBe(false)
    expect(matrix.isDark(1, matrix.size - 2)).toBe(false)
  })

  it('grows with the content and accepts UTF-8', () => {
    const short = qrMatrix('hi')
    const long = qrMatrix('ü'.repeat(120))
    expect(long.size).toBeGreaterThan(short.size)
  })
})
