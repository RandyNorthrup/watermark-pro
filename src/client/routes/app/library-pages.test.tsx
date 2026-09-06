import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  seedOwnerWorkspace,
  seedViewerWorkspace,
  VIEWER,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi, makeAsset, makeWatermark } from '../../test-support/fake-library-api'
import { renderedSpecs, resetFakePreview } from '../../test-support/fake-preview'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
vi.mock('../../lib/image-size', () => import('../../test-support/fake-image-size'))

const client = fakeAuth

beforeEach(() => {
  installFakeAuth()
  resetFakePreview()
  // jsdom has no object URLs; the fake preview never creates one, but the panel revokes.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:unused'), revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('library page', () => {
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
    expect(screen.queryByRole('link', { name: 'New preset' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create the first preset' })).not.toBeInTheDocument()
  })

  it('explains a failed load', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ failWith: 'forbidden' })
    renderApp('/app/library')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this.')
  })
})

describe('preset designer', () => {
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
    await user.selectOptions(screen.getByLabelText('Font'), 'Lobster')
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
    expect(await screen.findByText('Tiled signature')).toBeInTheDocument()
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

  it('uploads a logo, selects it, and blocks saving until a logo is chosen', async () => {
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
    expect(await screen.findByRole('button', { name: 'Logo new-mark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(api.assets.map((asset) => asset.name)).toEqual(['Brand mark', 'new-mark'])
    await waitFor(() => {
      const latest = renderedSpecs.at(-1)
      expect(latest?.kind).toBe('image')
    })
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeEnabled()

    await user.upload(input, new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not an image the browser can read')
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
