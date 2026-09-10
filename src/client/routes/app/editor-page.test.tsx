import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FILTER_BY_ID } from '../../../shared/adjustments'
import * as imageSize from '../../lib/image-size'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import { takeLaunchFiles } from '../../lib/launch-consumer'
import { clearLaunchFiles, receiveLaunchFiles } from '../../lib/launch-files'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { seedOwnerWorkspace, seedViewerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { cloudUploadBatches, fakeCloudSaver } from '../../test-support/fake-cloud-save'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import {
  exports,
  renderedBatches,
  renderedSpecs,
  renderedTransforms,
  resetFakePreview,
  previewSubjects,
} from '../../test-support/fake-preview'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/imports/google-drive-save', () => ({ saveToGoogleDrive: vi.fn() }))
const googleSave = vi.mocked(saveToGoogleDrive)

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
vi.mock('../../lib/image-size', () => import('../../test-support/fake-image-size'))
vi.mock('../../lib/thumbnail', () => import('../../test-support/fake-thumbnail'))
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))

const client = fakeAuth

function lastSpec() {
  return renderedSpecs.at(-1)
}

/** The preset picker, which adds a layer; its label changes once one exists. */
function presetSelect() {
  return screen.getByRole('combobox', { name: /^(Preset|Add another preset)$/ })
}

/** Opens the editor with the first preset and switches to a square crop. */
async function openSquareCrop(user: ReturnType<typeof userEvent.setup>) {
  seedOwnerWorkspace(client())
  installLibraryApi({ watermarks: [makeWatermark()] })
  renderApp('/app/editor?preset=wm-1')
  // URL selection replaces the empty picker's label; wait for the selected
  // state rather than racing a transient label before the preset is applied.
  await screen.findByRole('combobox', { name: 'Add another preset' })
  await user.click(screen.getByRole('tab', { name: 'Crop' }))
  await user.click(screen.getByRole('button', { name: '1:1' }))
  expect(screen.getByLabelText('Width (px)')).toHaveValue(640)
}

/** Renders the editor with cloud providers, opens Export, and clicks "Save to Google Drive". */
async function openExportCloudSave(): Promise<{ user: ReturnType<typeof userEvent.setup> }> {
  const user = userEvent.setup()
  seedOwnerWorkspace(client())
  installLibraryApi({ watermarks: [makeWatermark()], publicConfig: ALL_CLOUD_CONFIG })
  renderApp('/app/editor?preset=wm-1')
  await user.click(await screen.findByRole('tab', { name: 'Export' }))
  const saveButton = await screen.findByRole('button', { name: 'Save to Google Drive' })
  await waitFor(() => expect(saveButton).toBeEnabled())
  await user.click(saveButton)
  return { user }
}

beforeEach(() => {
  clearLaunchFiles()
  setOfflineUser(null)
  installFakeAuth()
  resetFakePreview()
  downloads.mockClear()
  googleSave.mockReset()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:unused'), revokeObjectURL: vi.fn() })
  // jsdom has no layout; give the preview image a size so the overlays render.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 480,
    bottom: 320,
    width: 480,
    height: 320,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  clearLaunchFiles()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('editor page', () => {
  it('adopts a fresh startup launch after authentication and another launch while already open', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    const first = new File(['synthetic'], 'startup.png', { type: 'image/png' })
    await receiveLaunchFiles(
      [{ getFile: () => Promise.resolve(first) }],
      vi.fn().mockResolvedValue(undefined),
    )
    const { router } = renderApp('/app/editor')
    expect(await screen.findByText(/startup.png/)).toBeInTheDocument()
    expect(previewSubjects).toContain(first)
    const next = new File(['synthetic'], 'next.png', { type: 'image/png' })
    await act(() =>
      receiveLaunchFiles([{ getFile: () => Promise.resolve(next) }], (to) =>
        router.navigate({ to }),
      ),
    )
    expect(await screen.findByText(/next.png/)).toBeInTheDocument()
    expect(screen.queryByText(/startup.png/)).not.toBeInTheDocument()
    expect(previewSubjects.at(-1)).toBe(next)
    expect(takeLaunchFiles('/app/editor')).toEqual([])
  })

  it('never drains a multi-photo launch into the single-photo editor', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/editor')
    await screen.findByRole('heading', { level: 1, name: 'Editor' })
    const files = ['bulk-one.png', 'bulk-two.png'].map(
      (name) => new File(['synthetic'], name, { type: 'image/png' }),
    )
    await act(() =>
      receiveLaunchFiles(
        files.map((file) => ({ getFile: () => Promise.resolve(file) })),
        vi.fn().mockResolvedValue(undefined),
      ),
    )
    expect(previewSubjects).toEqual([])
    expect(screen.queryByText(/bulk-one.png/)).not.toBeInTheDocument()
    expect(takeLaunchFiles('/app/bulk')).toEqual(files)
  })

  it.each(['switch', 'unmount', 'new-photo'] as const)(
    'rejects delayed launch metadata after %s',
    async (change) => {
      seedOwnerWorkspace(client())
      installLibraryApi({ watermarks: [makeWatermark()] })
      const view = renderApp('/app/editor')
      await screen.findByRole('heading', { level: 1, name: 'Editor' })
      const size = Promise.withResolvers<{ width: number; height: number }>()
      const readSize = vi
        .spyOn(imageSize, 'readImageSize')
        .mockImplementationOnce(() => size.promise)
      const stale = new File(['synthetic'], 'stale.png', { type: 'image/png' })
      await act(() =>
        receiveLaunchFiles(
          [{ getFile: () => Promise.resolve(stale) }],
          vi.fn().mockResolvedValue(undefined),
        ),
      )
      expect(readSize).toHaveBeenCalledWith(stale)
      if (change === 'unmount') view.unmount()
      else if (change === 'switch') setOfflineUser('different-account')
      else {
        const fresh = new File(['synthetic'], 'fresh.png', { type: 'image/png' })
        await act(() =>
          receiveLaunchFiles(
            [{ getFile: () => Promise.resolve(fresh) }],
            vi.fn().mockResolvedValue(undefined),
          ),
        )
        await screen.findByText(/fresh.png/)
      }
      await act(async () => {
        size.resolve({ width: 100, height: 100 })
        await size.promise
      })
      expect(previewSubjects).not.toContain(stale)
      expect(screen.queryByText(/stale.png/)).not.toBeInTheDocument()
      if (change === 'new-photo') expect(screen.getByText(/fresh.png/)).toBeInTheDocument()
    },
  )

  it('loads the preset from the URL, places it by hand, and undoes', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark(), makeWatermark({ id: 'wm-2', name: 'Two' })] })
    renderApp('/app/editor?preset=wm-1')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Editor')
    expect(
      screen.getByText(/Download the result or choose a gallery or cloud save/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Nothing leaves your browser/)).not.toBeInTheDocument()
    // The preset from the URL is the first (and active) layer.
    const layers = within(await screen.findByRole('list', { name: 'Layers, bottom to top' }))
    expect(layers.getByRole('button', { pressed: true })).toHaveTextContent('Studio signature')
    await waitFor(() => expect(lastSpec()?.style.opacity).toBe(0.85))

    const frame = await screen.findByRole('group', { name: /Watermark position/ })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    await waitFor(() => expect(lastSpec()?.placement).toEqual({ mode: 'custom', x: 0.79, y: 0.9 }))
    expect(screen.getByText(/Adjusted for this photo/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(lastSpec()?.placement).toEqual({ mode: 'smart' }))
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(lastSpec()?.placement.mode).toBe('custom'))

    await user.click(screen.getByRole('button', { name: 'Revert' }))
    await waitFor(() => expect(lastSpec()?.placement).toEqual({ mode: 'smart' }))

    // A second preset becomes a second, active layer; removing it leaves the first.
    await user.selectOptions(presetSelect(), 'wm-2')
    expect(layers.getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(layers.getByRole('button', { pressed: true })).toHaveTextContent('Two')
    await waitFor(() => expect(renderedBatches.at(-1)).toHaveLength(2))
    await user.click(layers.getByRole('button', { name: 'Remove Two from this photo' }))
    await waitFor(() => expect(renderedBatches.at(-1)).toHaveLength(1))
    expect(screen.queryByRole('button', { name: /Remove Two/ })).not.toBeInTheDocument()
  })

  it('crops with a preset ratio, resizes with the lock, and exports the transform', async () => {
    const user = userEvent.setup()
    await openSquareCrop(user)
    // Sample scene is 960×640: a centred square is 640×640 at x = 160.
    expect(screen.getByLabelText('Left (px)')).toHaveValue(160)
    const cropFrame = await screen.findByRole('group', { name: /Crop area/ })
    fireEvent.keyDown(cropFrame, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByLabelText('Left (px)')).toHaveValue(170))
    // The crop tool previews the untouched photo, so no transform is rendered.
    expect(renderedTransforms.at(-1)).toBeUndefined()

    await user.click(screen.getByRole('tab', { name: 'Resize' }))
    await waitFor(() =>
      expect(renderedTransforms.at(-1)).toEqual({
        crop: { x: 170, y: 0, width: 640, height: 640 },
      }),
    )
    expect(screen.getByLabelText('Width (px)')).toHaveValue(640)
    await user.click(screen.getByRole('button', { name: '50%' }))
    expect(screen.getByLabelText('Height (px)')).toHaveValue(320)
    await waitFor(() =>
      expect(renderedTransforms.at(-1)).toEqual({
        crop: { x: 170, y: 0, width: 640, height: 640 },
        resize: { width: 320, height: 320 },
      }),
    )
    expect(screen.getByText('Output 320 × 320 px.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Export' }))
    await user.click(screen.getByRole('combobox', { name: 'Format' }))
    await user.click(await screen.findByRole('option', { name: 'PNG' }))
    await user.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledTimes(1))
    expect(downloads.mock.calls[0]?.[1]).toBe('sample-photo-watermarked.png')
    expect(exports[0]?.output.format).toBe('image/png')
    expect(exports[0]?.transform).toEqual({
      crop: { x: 170, y: 0, width: 640, height: 640 },
      resize: { width: 320, height: 320 },
    })
  })

  it('applies a filter and an orientation, and undoes them', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/editor?preset=wm-1')
    await screen.findByRole('combobox', { name: 'Add another preset' })

    await user.click(screen.getByRole('tab', { name: 'Adjust' }))
    await user.click(screen.getByRole('radio', { name: 'Vivid' }))
    await waitFor(() =>
      expect(renderedTransforms.at(-1)?.adjust).toEqual(FILTER_BY_ID.vivid.adjust),
    )
    expect(screen.getByText('Filter: Vivid')).toBeInTheDocument()

    // Nudging one slider turns a named filter into a custom look.
    fireEvent.change(screen.getByRole('slider', { name: 'Saturation' }), {
      target: { value: '0.5' },
    })
    expect(await screen.findByText('Custom adjustments')).toBeInTheDocument()

    // Reset one slider, then reset everything back to Original.
    await user.click(screen.getByRole('button', { name: 'Reset Saturation' }))
    expect(screen.getByRole('slider', { name: 'Saturation' })).toHaveValue('0')
    await user.click(screen.getByRole('button', { name: 'Reset all' }))
    await waitFor(() => expect(screen.getByText('Filter: Original')).toBeInTheDocument())

    // Orientation lives on the Crop tab; rotating turns the output.
    await user.click(screen.getByRole('tab', { name: 'Crop' }))
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await waitFor(() => expect(renderedTransforms.at(-1)?.orientation?.turns).toBe(1))

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(renderedTransforms.at(-1)?.orientation).toBeUndefined())
  })

  it('opens a photo from disk, resets crop state, and rejects non-images', async () => {
    const user = userEvent.setup({ applyAccept: false })
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/editor')
    await screen.findByLabelText('Preset')
    expect(
      screen.getByText('Add a watermark, then open Export to download your photo.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()

    const input = screen.getByLabelText('Open a photo')
    await user.upload(input, new File(['jpeg'], 'holiday.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText(/holiday\.jpg · 4000 × 3000 px/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sample photo' })).toBeInTheDocument()

    await user.upload(input, new File(['nope'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not an image')

    await user.click(screen.getByRole('button', { name: 'Sample photo' }))
    expect(await screen.findByText(/Sample scene · 960 × 640 px/)).toBeInTheDocument()
  })

  it('applies keyboard undo shortcuts outside form fields', async () => {
    const user = userEvent.setup()
    await openSquareCrop(user)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(screen.getByLabelText('Width (px)')).toHaveValue(960))
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(screen.getByLabelText('Width (px)')).toHaveValue(640))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.getByLabelText('Width (px)')).toHaveValue(640)
    await user.click(screen.getByRole('button', { name: 'Reset crop' }))
    expect(screen.getByLabelText('Width (px)')).toHaveValue(960)
  })

  it('drags the mark, drops a photo, hides the frame for tiled marks, and reports export failures', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const base = makeWatermark()
    installLibraryApi({
      watermarks: [
        base,
        makeWatermark({
          id: 'wm-tiled',
          name: 'Tiled',
          spec: {
            ...base.spec,
            style: { ...base.spec.style, tiling: { enabled: true, spacing: 1 } },
          },
        }),
      ],
    })
    renderApp('/app/editor?preset=wm-1')
    const frame = await screen.findByRole('group', { name: /Watermark position/ })
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 300, clientY: 200 })
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 250, clientY: 200 })
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 250, clientY: 200 })
    await waitFor(() => expect(lastSpec()?.placement.mode).toBe('custom'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(lastSpec()?.placement).toEqual({ mode: 'smart' }))

    const canvas = screen.getByRole('img', { name: /Photo with the watermark/ }).parentElement
      ?.parentElement
    expect(canvas).not.toBeNull()
    const dropped = new File(['jpeg'], 'dropped.jpg', { type: 'image/jpeg' })
    fireEvent.drop(canvas!, { dataTransfer: { files: [dropped] } })
    expect(await screen.findByText(/dropped\.jpg/)).toBeInTheDocument()

    await user.selectOptions(presetSelect(), 'wm-tiled')
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: /Watermark position/ })).not.toBeInTheDocument()
    })

    const { PreviewRenderer } = await import('../../test-support/fake-preview')
    vi.spyOn(PreviewRenderer.prototype, 'exportFull').mockRejectedValueOnce(
      new Error('encoder exploded'),
    )
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('encoder exploded')
    expect(downloads).not.toHaveBeenCalled()
  })

  it('saves the export to the gallery and reports quota failures', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/editor?preset=wm-1')
    await screen.findByLabelText('Preset')
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: 'Save to gallery' }))
    expect(
      await screen.findByText(/Saved sample-photo-watermarked\.jpg to the/),
    ).toBeInTheDocument()
    expect(api.gallery.photos).toHaveLength(1)
    expect(api.gallery.photos[0]).toMatchObject({
      name: 'sample-photo-watermarked.jpg',
      width: 960,
      height: 640,
      presetId: 'wm-1',
    })

    api.gallery.uploadFailsWith = 'quotaExceeded'
    await user.click(screen.getByRole('button', { name: 'Save to gallery' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The limit for this organization has been reached.',
    )
  })

  it('saves the export to a configured cloud provider', async () => {
    googleSave.mockImplementation(fakeCloudSaver('google'))
    await openExportCloudSave()

    await waitFor(() => expect(googleSave).toHaveBeenCalledTimes(1))
    expect(cloudUploadBatches.at(-1)).toHaveLength(1)
    expect(
      await screen.findByText(/Saved to your Google Drive .Lumafoil. folder/),
    ).toBeInTheDocument()
  })

  it('reports a cloud save failure in the export panel', async () => {
    googleSave.mockRejectedValue(new Error('Drive is full'))
    await openExportCloudSave()

    expect(await screen.findByText('Drive is full')).toBeInTheDocument()
  })

  it('hides saving from viewers', async () => {
    const user = userEvent.setup()
    seedViewerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/editor?preset=wm-1')
    await screen.findByLabelText('Preset')
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Save to gallery' })).not.toBeInTheDocument()
  })

  it('creates and applies a first watermark without leaving the uploaded photo', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi()
    const { router } = renderApp('/app/editor')
    await screen.findByRole('button', { name: 'Create watermark' })
    const photo = new File(['photo fixture'], 'first-photo.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Open a photo'), photo)
    await user.click(screen.getByRole('button', { name: 'Create watermark' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create watermark' })
    await within(dialog).findByLabelText('Preset name')
    await user.type(within(dialog).getByLabelText('Preset name'), 'First signature')
    await user.clear(within(dialog).getByRole('textbox', { name: 'Text' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Text' }), '© My first photo')
    await user.click(within(dialog).getByRole('button', { name: 'Save and use' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/app/editor')
    expect(api.watermarks).toHaveLength(1)
    expect(api.watermarks[0]?.spec).toMatchObject({ kind: 'text', text: '© My first photo' })
    expect(previewSubjects.filter((subject) => subject === photo).length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByRole('list', { name: 'Layers, bottom to top' })).toHaveTextContent(
      'First signature',
    )
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    await user.click(await screen.findByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(exports.at(-1)?.specs[0]).toMatchObject({ kind: 'text', text: '© My first photo' }),
    )
  })

  it('does not offer creation to a read-only member with an empty library', async () => {
    seedViewerWorkspace(client())
    installLibraryApi()
    renderApp('/app/editor')
    expect(
      await screen.findByText('No watermarks are available in this library yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create watermark' })).not.toBeInTheDocument()
  })
})
