import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SOURCE_URL, LEGAL_LINKS } from '../../shared/constants'
import { installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})

describe('factual privacy and terms', () => {
  it('describes staged personal cleanup and preserved collaborative/audit/billing records without immediate erasure', async () => {
    renderApp('/privacy')
    const account = await screen.findByRole('region', { name: 'Your account' })
    expect(
      within(account).getByText(/only for your verified sole-owner personal workspace/),
    ).toBeInTheDocument()
    expect(
      within(account).getByText(
        /files enter background cleanup and may remain while retries finish/,
      ),
    ).toBeInTheDocument()
    expect(
      within(account).getByText(
        /Collaborative or ambiguous workspaces, audit records and billing receipts are preserved/,
      ),
    ).toBeInTheDocument()
    expect(
      within(account).getByText(
        /does not erase downloaded files, copies on other devices or provider backups/,
      ),
    ).toBeInTheDocument()
    expect(
      within(account).getByText(/local saves on the current device after confirmed removal/),
    ).toBeInTheDocument()
    expect(
      within(account).queryByText(/does not erase downloaded, offline/),
    ).not.toBeInTheDocument()
    expect(
      within(account).getByText(/while your account remains; retry account removal/),
    ).toBeInTheDocument()
  })
  it('discloses hosted Stripe billing references without collecting full cards or workspace content', async () => {
    renderApp('/privacy')
    const billing = await screen.findByRole('region', { name: 'Payments' })
    expect(billing.querySelectorAll('p')).toHaveLength(1)
    expect(within(billing).getByText(/Stripe hosts those pages/)).toBeInTheDocument()
    expect(
      within(billing).getByText(/customer, Checkout, subscription and invoice IDs/),
    ).toBeInTheDocument()
    expect(
      within(billing).getByText(
        /payment-event receipts, subscription status and paid-through dates/,
      ),
    ).toBeInTheDocument()
    expect(
      within(billing).getByText(/no photos, videos, documents, logos or saved watermark content/),
    ).toBeInTheDocument()
    expect(
      within(billing).getByText(/Lumafoil does not collect or store full card numbers/),
    ).toBeInTheDocument()
    expect(screen.getByText(/October 3, 2026/).closest('time')).toHaveAttribute(
      'datetime',
      '2026-10-03',
    )
  })
  it('explains verified registration, offline copies and chosen providers with private contact links', async () => {
    renderApp('/privacy')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Privacy')
    expect(
      screen.getByText(
        /Account registration depends on current availability and requires a verified email/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/Account-scoped copies and queued edits/)).toBeInTheDocument()
    expect(
      screen.getByText(/Workspace access requires an explicit grant from its owner/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/invitation|inviter/i)).not.toBeInTheDocument()
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
  it('preserves ownership/warranty clauses while describing cloud sharing and bundled licenses honestly', async () => {
    renderApp('/terms')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Terms of service')
    expect(screen.getByText(/You keep every right you already hold/)).toBeInTheDocument()
    expect(screen.getByText(/without warranty of any kind/)).toBeInTheDocument()
    expect(
      screen.getByText(/selected cloud transfers and sharing send content/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Disconnected devices can retain local copies/)).toBeInTheDocument()
    expect(
      screen.getByText(/Your photos and presets stay separate unless you explicitly share them/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Workspace access requires a grant from its owner/)).toBeInTheDocument()
    expect(screen.queryByText(/automatically.*(share|access)/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'support@lumafoil.com' })).toHaveAttribute(
      'href',
      LEGAL_LINKS.support,
    )
    expect(screen.queryByText(/never.*shared with third parties/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Payments' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Stripe hosts/)).not.toBeInTheDocument()
  })
})
