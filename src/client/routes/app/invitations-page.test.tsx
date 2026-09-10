import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SiteInvitationDto } from '../../../shared/api-accounts'
import {
  makeMember,
  makeOrganization,
  seedOwnerWorkspace,
  OWNER,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { renderApp } from '../../test-support/render-app'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

const INVITATION: SiteInvitationDto = {
  id: 'own-invitation',
  email: 'friend@example.test',
  status: 'pending',
  createdAt: '2026-09-08T00:00:00.000Z',
  expiresAt: '2026-09-15T00:00:00.000Z',
}

function invitationApi(hasFailure = false) {
  const records: SiteInvitationDto[] = []
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input)
    if (url.startsWith('/api/me/referral-link'))
      return Promise.resolve(
        Response.json({
          url: 'https://lumafoil.com/signup?invitation=fixture-referral',
          acceptedAccounts: 0,
        }),
      )
    if (!url.startsWith('/api/me/invitations'))
      throw new Error(`Unexpected fixture request: ${url}`)
    if (hasFailure)
      return Promise.resolve(Response.json({ error: 'rate_limited' }, { status: 429 }))
    if (init?.method === 'POST') {
      records.push({ ...INVITATION })
      return Promise.resolve(Response.json(INVITATION, { status: 201 }))
    }
    if (init?.method === 'DELETE') {
      records[0] = { ...INVITATION, status: 'revoked' }
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(Response.json({ invitations: records }))
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

beforeEach(() => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('site invitation page', () => {
  it('explains isolation, validates email, sends and revokes only account-scoped invitations', async () => {
    const fetcher = invitationApi()
    const user = userEvent.setup()
    const { queryClient } = renderApp('/app/invitations')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Invite people')
    expect(screen.getByText(/shares none of your photos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url === '/api/me/invitations' && init?.method === 'POST',
      ),
    ).toBe(false)
    await user.type(screen.getByLabelText('Email address'), INVITATION.email)
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(
      await screen.findByText('Invitation sent. It expires in seven days.'),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(['site-invitations', OWNER.id])).toEqual({
      invitations: [INVITATION],
    })
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          url === '/api/me/invitations' &&
          init?.body === JSON.stringify({ email: INVITATION.email }),
      ),
    ).toBe(true)
    await user.click(
      screen.getByRole('button', { name: `Revoke invitation to ${INVITATION.email}` }),
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: `Revoke invitation to ${INVITATION.email}` }),
      ).toBeNull()
    })
    expect(screen.getByText(/Revoked/)).toBeInTheDocument()
  })
  it('shows failures and never presents an unsent invitation as sent', async () => {
    invitationApi(true)
    const user = userEvent.setup()
    renderApp('/app/invitations')
    await user.type(await screen.findByLabelText('Email address'), INVITATION.email)
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Invitation sent. It expires in seven days.')).toBeNull()
  })
  it('keeps personal workspace sharing separate from site admission', async () => {
    const state = fakeAuth().state
    const personalId = `personal-${OWNER.id}`
    const organization = makeOrganization(personalId, 'My workspace', personalId)
    organization.members = [makeMember(personalId, OWNER, 'owner')]
    state.organizations = [organization]
    state.activeOrganizationId = organization.id
    renderApp('/app/members')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Your private workspace',
    )
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Create a collaboration workspace' })).toHaveAttribute(
      'href',
      '/app/organizations/new',
    )
  })
})
