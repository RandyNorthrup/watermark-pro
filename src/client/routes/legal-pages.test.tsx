import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SOURCE_URL, LEGAL_LINKS } from '../../shared/constants'
import { installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})

describe('factual privacy and terms', () => {
  it('explains private admission, offline copies and chosen providers with usable private contact links', async () => {
    renderApp('/privacy')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Privacy')
    expect(
      screen.getByText(/New accounts require an invitation and a verified email/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Account-scoped copies and queued edits/)).toBeInTheDocument()
    expect(
      screen.getByText(/does not share the inviter’s workspace or content/),
    ).toBeInTheDocument()
    expect(screen.getByText(/includes no analytics beacon/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'support@lumafoil.com' })).toHaveAttribute(
      'href',
      LEGAL_LINKS.support,
    )
    expect(screen.getByRole('link', { name: 'GitHub’s private reporting form' })).toHaveAttribute(
      'href',
      `${APP_SOURCE_URL}/security/advisories/new`,
    )
    expect(screen.getByRole('link', { name: 'privacy notice' })).toHaveAttribute(
      'href',
      LEGAL_LINKS.turnstile,
    )
    expect(screen.queryByText(/Nothing is kept on our servers unless/)).not.toBeInTheDocument()
  })
  it('preserves ownership/warranty clauses while describing cloud sharing and bundled licences honestly', async () => {
    renderApp('/terms')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Terms of service')
    expect(screen.getByText(/You keep every right you already hold/)).toBeInTheDocument()
    expect(screen.getByText(/without warranty of any kind/)).toBeInTheDocument()
    expect(
      screen.getByText(/selected cloud transfers and sharing send content/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Disconnected devices can retain local copies/)).toBeInTheDocument()
    expect(
      screen.getByText(/Workspace ownership or administration does not grant site administration/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'support@lumafoil.com' })).toHaveAttribute(
      'href',
      LEGAL_LINKS.support,
    )
    expect(screen.queryByText(/never.*shared with third parties/)).not.toBeInTheDocument()
  })
})
