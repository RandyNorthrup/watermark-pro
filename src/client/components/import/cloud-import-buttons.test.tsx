import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CloudImportButtons } from './cloud-import-buttons'
import { ALL_CLOUD_CONFIG, NO_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { FAKE_CLOUD_FILE } from '../../test-support/fake-cloud-selection'

vi.mock('./cloud-browser-dialog', () => import('../../test-support/fake-cloud-browser-module'))

describe('CloudImportButtons', () => {
  it('renders configured providers and hides missing or partial registrations', () => {
    const { rerender, container } = render(
      <CloudImportButtons config={NO_CLOUD_CONFIG} onImport={vi.fn()} onError={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(
      <CloudImportButtons
        config={{ ...NO_CLOUD_CONFIG, googleOAuthClientId: 'partial', dropboxAppKey: 'configured' }}
        onImport={vi.fn()}
        onError={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Dropbox' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Google Drive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'OneDrive' })).not.toBeInTheDocument()
  })

  it('passes document filters and original selections through one folder browser', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    const onError = vi.fn()
    render(
      <CloudImportButtons
        config={ALL_CLOUD_CONFIG}
        mediaKinds={['document']}
        onImport={onImport}
        onError={onError}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Google Drive' }))
    expect(await screen.findByText('document')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm Selection' }))
    expect(onImport).toHaveBeenCalledWith([FAKE_CLOUD_FILE])
    expect(onError).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm Selection' })).not.toBeInTheDocument()
  })

  it('forwards errors and closes cancellation without importing anything', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    const onError = vi.fn()
    render(<CloudImportButtons config={ALL_CLOUD_CONFIG} onImport={onImport} onError={onError} />)
    await user.click(screen.getByRole('button', { name: 'Dropbox' }))
    await user.click(await screen.findByRole('button', { name: 'Fail Browser' }))
    expect(onError).toHaveBeenCalledWith('Browser failed')
    await user.click(screen.getByRole('button', { name: 'Close Browser' }))
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm Selection' })).not.toBeInTheDocument()
  })
})
