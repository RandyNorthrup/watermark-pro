import { cleanup, render } from '@testing-library/react'
import { createInstance } from 'i18next'
import { createElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { PresetTemplates } from './preset-templates'
import en from '../../locales/en/common.json'

afterEach(cleanup)

it('fits every rotated label inside narrow and wide tiles without clipping its real SVG text', async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    defaultNS: 'common',
    resources: { en: { common: en } },
    interpolation: { escapeValue: false },
  })
  const templates = createElement(PresetTemplates, { onChoose: vi.fn() })
  const { container } = render(createElement(I18nextProvider, { i18n }, templates))
  const previews = container.querySelectorAll<SVGSVGElement>('[data-template-preview]')
  expect(previews.length).toBe(18)
  for (const width of [82, 140]) {
    for (const svg of previews) {
      const tile = svg.parentElement
      const text = svg.querySelector<SVGTextElement>('[data-template-preview-text]')
      if (tile === null || text === null) throw new Error('Template preview missing')
      // Supply the two real tile constraints without depending on the app's
      // CSS bundle; the component itself supplies the SVG fit behavior.
      Object.assign(tile.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${String(width)}px`,
        height: '80px',
      })
      const bounds = text.getBoundingClientRect()
      const frame = tile.getBoundingClientRect()
      expect(bounds.left).toBeGreaterThanOrEqual(frame.left)
      expect(bounds.right).toBeLessThanOrEqual(frame.right)
      expect(bounds.top).toBeGreaterThanOrEqual(frame.top)
      expect(bounds.bottom).toBeLessThanOrEqual(frame.bottom)
      expect(bounds.width).toBeGreaterThan(10)
    }
  }
  const longText = [
    ...container.querySelectorAll<SVGTextElement>('[data-template-preview-text]'),
  ].find((element) => element.textContent === 'STRICTLY CONFIDENTIAL')
  const svg = longText?.ownerSVGElement
  const tile = svg?.parentElement
  if (
    longText === undefined ||
    svg === null ||
    svg === undefined ||
    tile === null ||
    tile === undefined
  )
    throw new Error('Long-label negative control missing')
  tile.style.width = '82px'
  Object.assign(svg.style, { maxWidth: 'none', maxHeight: 'none', flexShrink: '0' })
  const broken = longText.getBoundingClientRect()
  const limit = tile.getBoundingClientRect()
  expect(
    broken.left < limit.left ||
      broken.right > limit.right ||
      broken.top < limit.top ||
      broken.bottom > limit.bottom,
  ).toBe(true)
})
