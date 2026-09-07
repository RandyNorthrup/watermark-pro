import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TakePhotoButton } from './take-photo-button'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Report the given coarse-pointer match to `isCaptureSupported`. */
function stubMatchMedia(isMatch: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: isMatch, media: query })),
  )
}

const png = () => new File([new Uint8Array([1])], 'shot.jpg', { type: 'image/jpeg' })

describe('TakePhotoButton', () => {
  it('renders nothing where capture is not supported', () => {
    stubMatchMedia(false)
    const { container } = render(<TakePhotoButton onCapture={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Take a photo' })).not.toBeInTheDocument()
  })

  it('hands the captured file to onCapture and sets the capture attribute', async () => {
    stubMatchMedia(true)
    const onCapture = vi.fn()
    render(<TakePhotoButton onCapture={onCapture} />)

    const input = screen.getByLabelText('Take a photo')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument()

    const user = userEvent.setup()
    // The button forwards the click to the hidden input (no file chosen here).
    await user.click(screen.getByRole('button', { name: 'Take a photo' }))
    await user.upload(input, png())

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture.mock.calls[0]?.[0]).toBeInstanceOf(File)
  })

  it('does nothing when the picker is dismissed with no file', () => {
    stubMatchMedia(true)
    const onCapture = vi.fn()
    render(<TakePhotoButton onCapture={onCapture} />)

    fireEvent.change(screen.getByLabelText('Take a photo'), { target: { files: [] } })
    expect(onCapture).not.toHaveBeenCalled()
  })
})
