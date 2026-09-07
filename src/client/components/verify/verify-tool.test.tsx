import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VerifyTool } from './verify-tool'
import { readInvisibleFromFile } from '../../lib/read-invisible'

vi.mock('../../lib/read-invisible', () => ({ readInvisibleFromFile: vi.fn() }))
const readMock = vi.mocked(readInvisibleFromFile)

const png = () => new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' })

afterEach(() => {
  readMock.mockReset()
})

describe('VerifyTool', () => {
  it('shows the hidden message when one is found', async () => {
    readMock.mockResolvedValue('Blow Money')
    const user = userEvent.setup()
    render(<VerifyTool />)
    await user.upload(screen.getByLabelText('Photo to check'), png())
    expect(await screen.findByText('Blow Money')).toBeInTheDocument()
  })

  it('reports when there is no mark', async () => {
    readMock.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<VerifyTool />)
    await user.upload(screen.getByLabelText('Photo to check'), png())
    expect(await screen.findByText(/No invisible mark/)).toBeInTheDocument()
  })

  it('surfaces a decode error', async () => {
    readMock.mockRejectedValue(new Error('broken file'))
    const user = userEvent.setup()
    render(<VerifyTool />)
    await user.upload(screen.getByLabelText('Photo to check'), png())
    expect(await screen.findByText(/broken file/)).toBeInTheDocument()
  })
})
