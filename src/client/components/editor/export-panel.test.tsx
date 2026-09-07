import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ExportPanel } from './export-panel'
import type { Size } from '../../engine/layout'

const ROOMY: Size = { width: 1000, height: 1000 }

function setup(outputSize: Size = ROOMY) {
  const onExport = vi.fn()
  render(
    <ExportPanel
      organizationName="Acme"
      outputSize={outputSize}
      isReady
      isExporting={false}
      onExport={onExport}
      onShare={vi.fn()}
      isSharing={false}
    />,
  )
  return { onExport, user: userEvent.setup() }
}

async function chooseFormat(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Format' }))
  await user.click(await screen.findByRole('option', { name }))
}

describe('ExportPanel invisible mark', () => {
  it('embeds the message when PNG is chosen and the toggle is on', async () => {
    const { onExport, user } = setup()
    await chooseFormat(user, 'PNG')
    await user.click(screen.getByRole('checkbox', { name: 'Invisible mark' }))
    expect(screen.getByLabelText('Invisible message')).toHaveValue('Acme')
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'image/png', invisible: { message: 'Acme' } }),
    )
  })

  it('disables the toggle for a lossy format and embeds nothing', async () => {
    const { onExport, user } = setup()
    expect(screen.getByRole('checkbox', { name: 'Invisible mark' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(onExport).toHaveBeenCalledWith(
      expect.not.objectContaining({ invisible: expect.anything() }),
    )
  })

  it('embeds nothing when the toggle is on but the message is cleared', async () => {
    const { onExport, user } = setup()
    await chooseFormat(user, 'PNG')
    await user.click(screen.getByRole('checkbox', { name: 'Invisible mark' }))
    await user.clear(screen.getByLabelText('Invisible message'))
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(onExport).toHaveBeenCalledWith(
      expect.not.objectContaining({ invisible: expect.anything() }),
    )
  })

  it('blocks the download when the message will not fit the photo', async () => {
    const { user } = setup({ width: 8, height: 8 })
    await chooseFormat(user, 'PNG')
    await user.click(screen.getByRole('checkbox', { name: 'Invisible mark' }))
    expect(screen.getByText(/Too long/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })
})
