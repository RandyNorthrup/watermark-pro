import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImportDialog } from './import-dialog'
import type { PresetFile } from '../../../shared/preset-file'
import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { importPresetFile, parsePresetFile } from '../../lib/preset-file'

vi.mock('../../lib/preset-file', () => ({
  parsePresetFile: vi.fn(),
  importPresetFile: vi.fn(),
}))
const parseMock = vi.mocked(parsePresetFile)
const importMock = vi.mocked(importPresetFile)

function bundle(names: string[]): PresetFile {
  return {
    format: 'watermark-pro/presets',
    version: 1,
    exportedAt: '2026-09-07T12:00:00.000Z',
    presets: names.map((name) => ({ name, spec: DEFAULT_TEXT_SPEC })),
  }
}

function renderDialog(existingNames: string[] = []) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ImportDialog
        organizationId="org-1"
        existingNames={existingNames}
        trigger={<button type="button">Open import</button>}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const presetFile = () => new File(['{}'], 'library.wmp.json', { type: 'application/json' })

afterEach(() => {
  parseMock.mockReset()
  importMock.mockReset()
})

describe('ImportDialog', () => {
  it('imports the ticked presets, renaming a name that clashes', async () => {
    parseMock.mockResolvedValue(bundle(['Corner', 'Studio']))
    importMock.mockResolvedValue([])
    const user = renderDialog(['Corner'])

    await user.click(screen.getByRole('button', { name: 'Open import' }))
    await user.upload(screen.getByLabelText('Preset file'), presetFile())

    expect(await screen.findByText(/2 presets in this file/)).toBeInTheDocument()
    expect(screen.getByText(/already exists/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Studio/ }))
    await user.click(screen.getByRole('button', { name: /Import 1 preset/ }))

    await waitFor(() => expect(importMock).toHaveBeenCalled())
    expect(importMock.mock.calls[0]?.[1]).toEqual([{ name: 'Corner (2)', spec: DEFAULT_TEXT_SPEC }])
  })

  it('reports a parse error, then an empty preset file', async () => {
    const user = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Open import' }))

    parseMock.mockRejectedValueOnce(new Error('bad file'))
    await user.upload(screen.getByLabelText('Preset file'), presetFile())
    expect(await screen.findByText(/bad file/)).toBeInTheDocument()

    parseMock.mockResolvedValueOnce(bundle([]))
    await user.upload(screen.getByLabelText('Preset file'), presetFile())
    expect(await screen.findByText(/no presets/)).toBeInTheDocument()
  })
})
