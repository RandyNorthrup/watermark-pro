import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'

const capabilityState = vi.hoisted(() => ({
  value: null as
    | null
    | { supported: false }
    | {
        supported: true
        videoCodec: 'avc'
        container: 'mp4'
        audioCodec: 'aac'
        canEncodeAudio: boolean
        label: string
      },
}))

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../video/capabilities', () => ({
  useVideoCapability: () => capabilityState.value,
}))

const client = fakeAuth

beforeEach(() => {
  installFakeAuth()
  capabilityState.value = null
})

describe('video page', () => {
  it('shows the unsupported message when the browser cannot encode video', async () => {
    capabilityState.value = { supported: false }
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/video')

    expect(await screen.findByText(/Your browser cannot encode video/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a video')).not.toBeInTheDocument()
  })

  it('shows the tool when the browser can encode video', async () => {
    capabilityState.value = {
      supported: true,
      videoCodec: 'avc',
      container: 'mp4',
      audioCodec: 'aac',
      canEncodeAudio: true,
      label: 'Saves as MP4 (H.264)',
    }
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/video')

    expect(await screen.findByLabelText('Add a video')).toBeInTheDocument()
    expect(screen.getByText('Saves as MP4 (H.264)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Studio signature' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Placement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watermark video' })).toBeInTheDocument()
  })
})
