import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { presetFileSchema } from '../../../shared/preset-file'
import { SIGNATURE_EXPORT_SIDE } from '../../editor/signature'
import { downloadBlob } from '../../lib/download'
import { describeSize, hasAlpha, runCleanup, toPngName } from '../../lib/logo-prepare-pipeline'
import { buildPresetFile } from '../../lib/preset-file'
import {
  seedOwnerWorkspace,
  seedViewerWorkspace,
  VIEWER,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { encoded, resetFakeCanvasBackend } from '../../test-support/fake-canvas-backend'
import { installLibraryApi, makeAsset, makeWatermark } from '../../test-support/fake-library-api'
import { renderedSpecs, resetFakePreview } from '../../test-support/fake-preview'
import { renderApp } from '../../test-support/render-app'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
vi.mock('../../lib/image-size', () => import('../../test-support/fake-image-size'))
vi.mock('../../lib/canvas-backend', () => import('../../test-support/fake-canvas-backend'))
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }))

const client = fakeAuth

beforeEach(() => {
  installFakeAuth()
  resetFakePreview()
  resetFakeCanvasBackend()
  // jsdom has no object URLs; the fake preview never creates one, but the panel revokes.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:unused'), revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('library page', () => {
  it('keeps Export in the toolbar while presets load and enables it only for real records', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    const fetcher = globalThis.fetch
    const pending = Promise.withResolvers<Response>()
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      requestUrl(input).endsWith('/watermarks') ? pending.promise : fetcher(input, init),
    )
    renderApp('/app/library')
    await screen.findByRole('heading', { name: 'Watermark library' })
    const exportButton = screen.getByRole('button', { name: 'Export' })
    expect(exportButton).toBeDisabled()
    expect(screen.queryByText('Studio signature')).not.toBeInTheDocument()
    pending.resolve(Response.json({ watermarks: [makeWatermark()] }))
    await screen.findByText('Studio signature')
    expect(exportButton).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBe(exportButton)
  })

  it('lists presets with their kind and placement and lets an owner delete one', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({
      watermarks: [
        makeWatermark(),
        makeWatermark({
          id: 'wm-2',
          name: 'Corner logo',
          spec: {
            kind: 'image',
            assetId: 'asset-1',
            placement: { mode: 'anchor', anchor: 'bottom-right' },
            contrast: { mode: 'manual', variant: 'light', outline: 0.4 },
            style: makeWatermark().spec.style,
          },
        }),
        makeWatermark({
          id: 'wm-3',
          name: 'Star',
          spec: {
            kind: 'symbol',
            symbol: { type: 'glyph', glyph: '★', fontFamily: 'Inter Variable' },
            placement: { mode: 'custom', x: 0.2, y: 0.8 },
            contrast: { mode: 'auto' },
            style: makeWatermark().spec.style,
          },
        }),
        makeWatermark({
          id: 'wm-4',
          name: 'Camera',
          spec: {
            kind: 'symbol',
            symbol: { type: 'icon', name: 'camera' },
            placement: { mode: 'smart' },
            contrast: { mode: 'auto' },
            style: makeWatermark().spec.style,
          },
        }),
      ],
    })
    renderApp('/app/library')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Watermark library')
    expect(await screen.findByText('“© Acme Studio” in Inter Variable')).toBeInTheDocument()
    expect(screen.getByText('bottom right')).toBeInTheDocument()
    expect(screen.getByText('Manual contrast')).toBeInTheDocument()
    expect(screen.getByText('Glyph ★')).toBeInTheDocument()
    expect(screen.getByText('Custom position')).toBeInTheDocument()
    expect(screen.getByText('Icon camera')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New preset' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Corner logo' }))
    await waitFor(() => expect(screen.queryByText('Corner logo')).not.toBeInTheDocument())
    expect(api.watermarks.map((preset) => preset.id)).toEqual(['wm-1', 'wm-3', 'wm-4'])
  })

  it('shows an empty state and hides creation from viewers', async () => {
    seedViewerWorkspace(client())
    installLibraryApi()
    renderApp('/app/library')
    expect(await screen.findByText(/No presets yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'New preset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create the first preset' })).not.toBeInTheDocument()
  })

  it('explains a failed load', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ failWith: 'forbidden' })
    renderApp('/app/library')
    expect(
      await within(await screen.findByRole('region', { name: 'Watermark library' })).findByRole(
        'alert',
      ),
    ).toHaveTextContent('Your role does not allow this.')
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('exports every preset as a parseable preset file', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/library')
    await screen.findByRole('heading', { level: 1 })

    await user.click(await screen.findByRole('button', { name: 'Export' }))
    await waitFor(() => {
      expect(vi.mocked(downloadBlob)).toHaveBeenCalled()
    })
    const lastCall = vi.mocked(downloadBlob).mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const [blob, fileName] = lastCall!
    expect(fileName).toMatch(/^presets-acme-studio-\d{4}-\d{2}-\d{2}\.wmp\.json$/)
    const parsed = presetFileSchema.parse(JSON.parse(await blob.text()))
    expect(parsed.presets.map((entry) => entry.name)).toEqual(['Studio signature'])
  })

  it('imports selected presets, renaming a name that already exists', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ watermarks: [makeWatermark()] })
    const bundle = buildPresetFile(
      [
        { name: 'Studio signature', spec: makeWatermark().spec },
        {
          name: 'Logo mark',
          spec: {
            kind: 'image',
            assetId: 'src-1',
            placement: { mode: 'smart' },
            contrast: { mode: 'auto' },
            style: makeWatermark().spec.style,
          },
        },
      ],
      [
        {
          assetId: 'src-1',
          name: 'Logo mark',
          contentType: 'image/png',
          width: 10,
          height: 10,
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        },
      ],
    )
    const file = new File([JSON.stringify(bundle)], 'library.wmp.json', {
      type: 'application/json',
    })

    renderApp('/app/library')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Import presets' }))
    await user.upload(await screen.findByLabelText('Preset file'), file)

    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import 2 presets' }))

    await waitFor(() => {
      expect(api.assets).toHaveLength(1)
    })
    expect(api.watermarks.map((preset) => preset.name)).toEqual([
      'Studio signature',
      'Studio signature (2)',
      'Logo mark',
    ])
  })
})

describe('preset designer', () => {
  it('saves separate QR destinations and filters the library without mixing their contents', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ watermarks: [makeWatermark()] })
    const { router } = renderApp('/app/library/new?kind=qr')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('New QR code')
    await user.type(screen.getByLabelText('Preset name'), 'Portfolio QR')
    await user.clear(screen.getByLabelText('QR code content'))
    await user.type(screen.getByLabelText('QR code content'), 'https://example.com/portfolio')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'))
    await user.click(await screen.findByRole('link', { name: 'New QR code' }))
    await screen.findByLabelText('QR code content')
    await user.type(screen.getByLabelText('Preset name'), 'Contact QR')
    await user.clear(screen.getByLabelText('QR code content'))
    await user.type(screen.getByLabelText('QR code content'), 'https://example.com/contact')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'))
    await user.click(await screen.findByRole('button', { name: 'QR codes only' }))
    expect(
      within(screen.getByRole('region', { name: 'Watermark library' })).getByRole('link', {
        name: /^Portfolio QR/,
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Watermark library' })).getByRole('link', {
        name: /^Contact QR/,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Studio signature/ })).not.toBeInTheDocument()
    expect(
      api.watermarks
        .filter((preset) => preset.spec.kind === 'qr')
        .map((preset) => (preset.spec.kind === 'qr' ? preset.spec.content : '')),
    ).toEqual(['https://example.com/portfolio', 'https://example.com/contact'])
    await user.click(
      within(screen.getByRole('region', { name: 'Watermark library' })).getByRole('link', {
        name: /^Portfolio QR/,
      }),
    )
    expect(await screen.findByLabelText('QR code content')).toHaveValue(
      'https://example.com/portfolio',
    )
    expect(screen.getByLabelText('QR code content')).not.toHaveValue('https://example.com/contact')
  })

  it('creates a text preset, previewing each change through the engine', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi()
    const { router } = renderApp('/app/library/new')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('New preset')
    expect(await screen.findByRole('img', { name: /Watermark preview/ })).toBeInTheDocument()
    expect(screen.getByText('Placed bottom right, dark ink.')).toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: 'Text' }))
    await user.type(screen.getByRole('textbox', { name: 'Text' }), '© Acme')
    await user.click(screen.getByRole('combobox', { name: 'Font' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search fonts' }), 'Lobster')
    await user.click(screen.getByRole('option', { name: 'Lobster' }))
    await waitFor(() => {
      const latest = renderedSpecs.at(-1)
      expect(latest?.kind === 'text' && latest.fontFamily).toBe('Lobster')
    })

    await user.click(screen.getByRole('tab', { name: 'Placement' }))
    await user.click(screen.getByRole('radio', { name: 'Corner' }))
    await user.click(screen.getByRole('button', { name: 'Top left' }))
    await user.click(screen.getByRole('tab', { name: 'Style' }))
    await user.click(screen.getByRole('radio', { name: 'Manual' }))
    await user.click(screen.getByRole('radio', { name: 'Dark ink' }))
    await user.click(screen.getByRole('switch', { name: 'Repeat across the photo' }))

    await user.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the preset a name')
    await user.type(screen.getByLabelText('Preset name'), 'Tiled signature')
    await user.click(screen.getByRole('button', { name: 'Save preset' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'))
    expect(api.watermarks).toHaveLength(1)
    const saved = api.watermarks[0]
    expect(saved?.name).toBe('Tiled signature')
    expect(saved?.spec).toMatchObject({
      kind: 'text',
      text: '© Acme',
      fontFamily: 'Lobster',
      placement: { mode: 'anchor', anchor: 'top-left' },
      contrast: { mode: 'manual', variant: 'dark' },
      style: { tiling: { enabled: true } },
    })
    expect(
      await within(await screen.findByRole('region', { name: 'Watermark library' })).findByText(
        'Tiled signature',
      ),
    ).toBeInTheDocument()
  })

  it('switches to a symbol mark and keeps the text draft when switching back', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi()
    renderApp('/app/library/new')
    await screen.findByRole('heading', { level: 1 })
    await user.clear(screen.getByRole('textbox', { name: 'Text' }))
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'Draft text')

    await user.click(screen.getByRole('tab', { name: 'Symbol' }))
    await user.click(screen.getByRole('button', { name: 'Glyph ★' }))
    await waitFor(() => {
      const latest = renderedSpecs.at(-1)
      expect(latest?.kind === 'symbol' && latest.symbol).toEqual({
        type: 'glyph',
        glyph: '★',
        fontFamily: 'Inter Variable',
      })
    })
    await user.click(screen.getByRole('button', { name: 'Icon Camera' }))
    await waitFor(() => {
      const latest = renderedSpecs.at(-1)
      expect(latest?.kind === 'symbol' && latest.symbol).toEqual({ type: 'icon', name: 'camera' })
    })

    await user.click(screen.getByRole('tab', { name: 'Text' }))
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Draft text')
  })

  it('prepares an uploaded logo, selects it, and blocks saving until a logo is chosen', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 128, height: 64, close: vi.fn() })),
    )
    const user = userEvent.setup({ applyAccept: false })
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ assets: [makeAsset()] })
    renderApp('/app/library/new')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('tab', { name: 'Logo' }))
    expect(await screen.findByRole('button', { name: 'Logo Brand mark' })).toBeInTheDocument()
    expect(screen.getByText('Choose or upload a logo to see the preview.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeDisabled()

    const input = screen.getByLabelText('Upload a logo file')
    await user.upload(
      input,
      new File([new Uint8Array([0x89, 0x50])], 'new-mark.png', { type: 'image/png' }),
    )
    const panel = await screen.findByRole('region', { name: 'Prepare logo' })
    const useLogo = await within(panel).findByRole('button', { name: 'Use logo' })
    await waitFor(() => {
      expect(useLogo).toBeEnabled()
    })
    await user.click(useLogo)

    expect(await screen.findByRole('button', { name: 'Logo new-mark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(api.assets.map((asset) => asset.name)).toEqual(['Brand mark', 'new-mark'])
    // The chosen file is re-encoded to a transparent PNG before upload.
    expect(encoded.at(-1)?.options.format).toBe('image/png')
    await waitFor(() => {
      const latest = renderedSpecs.at(-1)
      expect(latest?.kind).toBe('image')
    })
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeEnabled()

    await user.upload(input, new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not an image the browser can read')
  })

  it('toggles the prepare panel and uploads a PNG', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 96, height: 48, close: vi.fn() })),
    )
    const user = userEvent.setup({ applyAccept: false })
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ assets: [] })
    renderApp('/app/library/new')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('tab', { name: 'Logo' }))

    await user.upload(
      screen.getByLabelText('Upload a logo file'),
      new File([new Uint8Array([0x89, 0x50])], 'mark.png', { type: 'image/png' }),
    )
    const panel = await screen.findByRole('region', { name: 'Prepare logo' })
    const remove = await within(panel).findByRole('switch', { name: 'Remove background' })
    const trim = within(panel).getByRole('switch', { name: 'Trim transparent edges' })
    expect(remove).not.toBeChecked()
    await user.click(remove)
    expect(remove).toBeChecked()
    await user.click(trim)
    expect(trim).toBeChecked()

    await user.click(within(panel).getByRole('button', { name: 'Use logo' }))
    await waitFor(() => {
      expect(api.assets.map((asset) => asset.name)).toEqual(['mark'])
    })
    expect(encoded.at(-1)?.options.format).toBe('image/png')
  })

  it('saves a drawn signature as a logo and selects it', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ assets: [] })
    renderApp('/app/library/new')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('tab', { name: 'Logo' }))
    await user.click(screen.getByRole('button', { name: 'Draw a signature' }))
    const dialog = await screen.findByRole('dialog', { name: 'Draw a signature' })
    // jsdom has no layout: give the pad its drawn size so pointer positions map onto it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 320,
      width: 640,
      height: 320,
      toJSON: () => ({}),
    })
    const pad = within(dialog).getByRole('img', { name: /Signature pad/ })
    const save = within(dialog).getByRole('button', { name: 'Save as logo' })
    expect(save).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Undo stroke' })).toBeDisabled()

    await user.click(within(dialog).getByRole('radio', { name: '10 pixel pen' }))
    for (const [x, y] of [
      [40, 60],
      [120, 90],
      [200, 70],
    ]) {
      fireEvent.pointerDown(pad, { clientX: x, clientY: y, pointerId: 1 })
      fireEvent.pointerMove(pad, { clientX: (x ?? 0) + 30, clientY: (y ?? 0) + 10, pointerId: 1 })
      fireEvent.pointerUp(pad, { clientX: (x ?? 0) + 30, clientY: (y ?? 0) + 10, pointerId: 1 })
    }
    expect(save).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'Undo stroke' }))
    await user.click(save)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.assets.map((asset) => asset.name)).toEqual(['signature'])
    expect(await screen.findByRole('button', { name: 'Logo signature' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const saved = encoded.at(-1)
    expect(saved?.options.format).toBe('image/png')
    expect(Math.max(saved?.width ?? 0, saved?.height ?? 0)).toBe(SIGNATURE_EXPORT_SIDE)
  })

  it('refuses to delete a logo that a preset still uses', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({
      assets: [makeAsset()],
      watermarks: [
        makeWatermark({
          id: 'wm-logo',
          spec: {
            kind: 'image',
            assetId: 'asset-1',
            placement: { mode: 'smart' },
            contrast: { mode: 'auto' },
            style: makeWatermark().spec.style,
          },
        }),
      ],
    })
    renderApp('/app/library/new')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('tab', { name: 'Logo' }))
    await user.click(await screen.findByRole('button', { name: 'Delete logo Brand mark' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This item is still in use.')
  })

  it('edits an existing preset and shows viewers a read-only designer', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ watermarks: [makeWatermark()] })
    const { router, unmount } = renderApp('/app/library/wm-1')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Studio signature')
    expect(screen.getByLabelText('Preset name')).toHaveValue('Studio signature')
    await user.clear(screen.getByLabelText('Preset name'))
    await user.type(screen.getByLabelText('Preset name'), 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/library'))
    expect(api.watermarks[0]?.name).toBe('Renamed')
    unmount()

    client().state.user = VIEWER
    renderApp('/app/library/wm-1')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Renamed')
    expect(screen.getByText('Read-only view.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('tells a viewer they cannot create presets and reports a missing preset', async () => {
    seedViewerWorkspace(client())
    installLibraryApi()
    const { unmount } = renderApp('/app/library/new')
    expect(await screen.findByRole('alert')).toHaveTextContent('does not allow creating presets')
    unmount()

    renderApp('/app/library/missing')
    expect(await screen.findByRole('alert')).toHaveTextContent('That preset no longer exists.')
  })
})

describe('logo prepare helpers', () => {
  it('detects an alpha channel', () => {
    expect(hasAlpha({ data: new Uint8ClampedArray([10, 20, 30, 255]), width: 1, height: 1 })).toBe(
      false,
    )
    expect(hasAlpha({ data: new Uint8ClampedArray([10, 20, 30, 0]), width: 1, height: 1 })).toBe(
      true,
    )
  })

  it('renames the prepared file to a .png', () => {
    expect(toPngName('logo.jpg')).toBe('logo.png')
    expect(toPngName('logo')).toBe('logo.png')
    expect(toPngName('a.b.webp')).toBe('a.b.png')
  })

  it('formats the output size', () => {
    expect(describeSize(128, 64)).toBe('128 × 64')
  })

  it('trims transparent margins, cropping to the visible pixels', () => {
    const bordered = new Uint8ClampedArray(3 * 3 * 4)
    const centre = (1 * 3 + 1) * 4
    bordered[centre] = 200
    bordered[centre + 1] = 100
    bordered[centre + 2] = 50
    bordered[centre + 3] = 255
    const result = runCleanup(
      { data: bordered, width: 3, height: 3 },
      { removeBackground: false, tolerance: 0, trim: true },
    )
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
  })

  it('keeps the original when a trim would erase everything', () => {
    const empty = { data: new Uint8ClampedArray(2 * 2 * 4), width: 2, height: 2 }
    const guarded = runCleanup(empty, { removeBackground: false, tolerance: 0, trim: true })
    expect(guarded.width).toBe(2)
    expect(guarded.height).toBe(2)
  })

  it('clears a flat background and leaves a no-op alone', () => {
    const white = new Uint8ClampedArray(2 * 2 * 4).fill(255)
    const removed = runCleanup(
      { data: white, width: 2, height: 2 },
      { removeBackground: true, tolerance: 24, trim: false },
    )
    expect(removed.width).toBe(2)
    expect(removed.data[3]).toBeLessThan(255)

    const source = { data: new Uint8ClampedArray([1, 2, 3, 255]), width: 1, height: 1 }
    const untouched = runCleanup(source, { removeBackground: false, tolerance: 0, trim: false })
    expect(untouched).toBe(source)
  })
})
