import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})

describe('public product explanation', () => {
  it('explains concrete tools and free self-hosting without offering unrestricted signup', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Tools For Every Watermark' })).toBeVisible()
    for (const name of [
      'Text, Logos, Shapes, And Signatures',
      'Photos, PDFs, And Videos In One Batch',
      '551 Unique Font Families',
      '400 Colorful Vector Stickers',
      'Create And Save QR Watermarks',
      '18 Presets And Your Own Saved Watermarks',
      'Video Placement And Fade Effects',
      'Preview And Watermark PDF Pages',
      'Work Offline, Sync Later',
      'Your Account, Your Workspace',
      'Connected Cloud Folders',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByText('Prefer to self-host?')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Get the source code free on GitHub.' }),
    ).toHaveAttribute('href', 'https://github.com/RandyNorthrup/watermark-pro')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/RandyNorthrup/watermark-pro',
    )
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull()
    expect(screen.queryByText('Built to be trusted')).toBeNull()
    expect(screen.getAllByText(/Each account has its own workspace/)[0]).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Start free. Make room for more.' })).toBeVisible()
    expect(screen.getByText('$9')).toBeVisible()
    expect(screen.getByText('$24')).toBeVisible()
    expect(screen.getByText('Three people, including the owner')).toBeVisible()
    expect(screen.queryByText(/invitation-only/i)).toBeNull()
    expect(screen.getByText(/Cloud storage is in preview\./)).toBeVisible()
    expect(
      screen.getByText(/Browse Recent Work in thumbnail, list, or details views\./),
    ).toBeVisible()
    expect(screen.getByText(/reuse them in Images, Documents, Videos, or Bulk\./)).toBeVisible()
  })
})
