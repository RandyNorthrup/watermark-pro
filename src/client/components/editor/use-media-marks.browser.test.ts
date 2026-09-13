import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useMediaMarks } from './use-media-marks'
import { ACCOUNT_ID_HEADER } from '../../../shared/account-identity'
import {
  DEFAULT_SHAPE_SPEC,
  DEFAULT_TEXT_SPEC,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { FontLoader } from '../../engine/fonts'
import { MarkResources, type MarkInputs } from '../../lib/mark-resources'
import { setOfflineUser } from '../../lib/offline-context'
import { requestUrl } from '../../test-support/request-url'

const LOGO: WatermarkSpec = {
  kind: 'image',
  assetId: 'fixture-logo',
  placement: DEFAULT_SHAPE_SPEC.placement,
  contrast: DEFAULT_SHAPE_SPEC.contrast,
  style: DEFAULT_SHAPE_SPEC.style,
}
beforeEach(() => {
  vi.spyOn(FontLoader.prototype, 'ensure').mockResolvedValue()
})
afterEach(() => {
  cleanup()
  setOfflineUser(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function sourceCanvas() {
  const canvas = new OffscreenCanvas(8, 8)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Real canvas unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 8, 8)
  return canvas
}
async function bitmap() {
  return await createImageBitmap(sourceCanvas())
}

it('reuses resources for text/style edits but reloads changed font identities and closes old bitmaps', async () => {
  const bitmaps: ImageBitmap[] = []
  const resolve = vi.spyOn(MarkResources.prototype, 'resolve').mockImplementation(async (specs) => {
    const image = await bitmap()
    bitmaps.push(image)
    return {
      marks: specs.map((spec) => (spec.kind === 'image' ? { spec, image } : { spec })),
      fonts: [],
    }
  })
  const initial: WatermarkSpec[] = [
    DEFAULT_TEXT_SPEC,
    DEFAULT_SHAPE_SPEC,
    {
      kind: 'symbol',
      symbol: { type: 'glyph', glyph: '©', fontFamily: 'Inter Variable' },
      placement: DEFAULT_SHAPE_SPEC.placement,
      contrast: DEFAULT_SHAPE_SPEC.contrast,
      style: DEFAULT_SHAPE_SPEC.style,
    },
    LOGO,
  ]
  const { result, rerender } = renderHook(
    ({ specs }: { specs: WatermarkSpec[] }) => useMediaMarks('studio', specs),
    {
      initialProps: { specs: initial },
    },
  )
  await waitFor(() => expect(result.current.marks).toHaveLength(4))
  const updated: WatermarkSpec[] = [
    {
      ...DEFAULT_TEXT_SPEC,
      text: 'Current Words',
      style: { ...DEFAULT_TEXT_SPEC.style, rotation: 45 },
    },
    ...initial.slice(1),
  ]
  rerender({ specs: updated })
  expect(resolve).toHaveBeenCalledOnce()
  expect(result.current.marks[0]?.spec).toMatchObject({
    text: 'Current Words',
    style: { rotation: 45 },
  })
  expect(bitmaps[0]?.width).toBe(8)
  rerender({ specs: [{ ...DEFAULT_TEXT_SPEC, fontWeight: 700 }, ...initial.slice(1)] })
  await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(result.current.marks).toHaveLength(4))
  expect(bitmaps[0]?.width).toBe(0)
  expect(result.current.marks[3]?.image).toBe(bitmaps[1])
})

it.each(['switch', 'unmount'] as const)(
  'discards a late bitmap after workspace %s',
  async (action) => {
    const pending = Promise.withResolvers<MarkInputs>()
    vi.spyOn(MarkResources.prototype, 'resolve')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ marks: [{ spec: DEFAULT_SHAPE_SPEC }], fonts: [] })
    const initialSpecs: WatermarkSpec[] = [LOGO]
    const { result, rerender, unmount } = renderHook(
      ({ org, specs }: { org: string; specs: WatermarkSpec[] }) => useMediaMarks(org, specs),
      { initialProps: { org: 'original', specs: initialSpecs } },
    )
    if (action === 'switch') {
      rerender({ org: 'different', specs: [DEFAULT_SHAPE_SPEC] })
      await waitFor(() => expect(result.current.marks[0]?.spec.kind).toBe('shape'))
    } else unmount()
    const image = await bitmap()
    await act(async () => {
      pending.resolve({ marks: [{ spec: LOGO, image }], fonts: [] })
      await pending.promise
    })
    await waitFor(() => expect(image.width).toBe(0))
    if (action === 'switch') expect(result.current.marks[0]?.image).toBeUndefined()
  },
)

it('releases prepared bitmaps on font failure and clears the error when the resource changes', async () => {
  const image = await bitmap()
  vi.spyOn(MarkResources.prototype, 'resolve')
    .mockResolvedValueOnce({ marks: [{ spec: LOGO, image }], fonts: [] })
    .mockResolvedValue({ marks: [{ spec: DEFAULT_SHAPE_SPEC }], fonts: [] })
  vi.spyOn(FontLoader.prototype, 'ensure')
    .mockRejectedValueOnce(new Error('Font unavailable'))
    .mockResolvedValue()
  const initialSpecs: WatermarkSpec[] = [LOGO]
  const { result, rerender } = renderHook(
    ({ specs }: { specs: WatermarkSpec[] }) => useMediaMarks('studio', specs),
    {
      initialProps: { specs: initialSpecs },
    },
  )
  await waitFor(() => expect(result.current.error).toBe('Font unavailable'))
  expect(result.current.marks).toEqual([])
  expect(image.width).toBe(0)
  rerender({ specs: [DEFAULT_SHAPE_SPEC] })
  await waitFor(() => expect(result.current.marks[0]?.spec.kind).toBe('shape'))
  expect(result.current.error).toBeNull()
})

it('loads a logo through the current account/workspace boundary and caches its decoded resource', async () => {
  const userId = `resource-${crypto.randomUUID()}`
  setOfflineUser(userId)
  const canvas = sourceCanvas()
  const source = await canvas.convertToBlob({ type: 'image/png' })
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(requestUrl(input)).toBe('/api/orgs/private-studio/assets/fixture-logo/file')
    expect(new Headers(init?.headers).get(ACCOUNT_ID_HEADER)).toBe(userId)
    return Promise.resolve(new Response(source, { headers: { 'content-type': 'image/png' } }))
  })
  vi.stubGlobal('fetch', fetcher)
  const { result, rerender, unmount } = renderHook(
    ({ specs }: { specs: WatermarkSpec[] }) => useMediaMarks('private-studio', specs),
    { initialProps: { specs: [LOGO] } },
  )
  await waitFor(() => expect(result.current.marks[0]?.image?.width).toBe(8))
  const image = result.current.marks[0]?.image
  rerender({ specs: [{ ...LOGO, style: { ...LOGO.style, scale: 0.4 } }] })
  expect(fetcher).toHaveBeenCalledOnce()
  expect(result.current.marks[0]?.image).toBe(image)
  unmount()
  expect(image?.width).toBe(0)
})
