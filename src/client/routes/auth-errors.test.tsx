import { act, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../shared/constants'
import { ACCOUNT_CHANGED_EVENT } from '../lib/offline-account'
import { currentOfflineUser, setOfflineUser } from '../lib/offline-context'
import {
  makeMember,
  makeOrganization,
  OWNER,
  seedOwnerWorkspace,
  VIEWER,
} from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

const client = fakeAuth

const failure = (message: string) =>
  Promise.resolve({
    data: null,
    error: { message, code: 'FAILED', status: HTTP_STATUS.badRequest },
  })

beforeEach(() => {
  installFakeAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function seedInvitationFor(user: typeof VIEWER) {
  const organization = makeOrganization('org-1', 'Acme Studio', 'acme-studio')
  organization.members.push(makeMember(organization.id, OWNER, 'owner'))
  organization.invitations.push({
    id: 'inv-9',
    organizationId: organization.id,
    email: user.email,
    role: 'viewer',
    status: 'pending',
    expiresAt: new Date('2026-12-01T00:00:00Z'),
    inviterId: OWNER.id,
  })
  client().state.user = user
  client().state.organizations = [organization]
}

describe('error paths on public pages', () => {
  it('reports a failed resend on the check-email page', async () => {
    const user = userEvent.setup()
    client().sendVerificationEmail.mockImplementationOnce(() => failure('Mail server down'))
    renderApp('/check-email?email=new%40example.test')
    await user.click(await screen.findByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mail server down')
  })

  it('validates the forgot-password form and reports server failures', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')
    await user.click(await screen.findByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()

    client().requestPasswordReset.mockImplementationOnce(() => failure('Too many requests'))
    await user.type(screen.getByLabelText('Email'), 'olivia@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
  })

  it('reports a rejected password reset', async () => {
    const user = userEvent.setup()
    renderApp('/reset-password?token=expired')
    await user.type(await screen.findByLabelText('New password'), 'a much longer passphrase')
    await user.type(screen.getByLabelText('Confirm password'), 'a much longer passphrase')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid token')
  })

  it('treats a reset page without a token as an unusable link', async () => {
    renderApp('/reset-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is not valid')
  })
})

describe('error paths on invitations', () => {
  it('binds a fresh invite page before its first private read and hides it after an account change', async () => {
    seedInvitationFor(VIEWER)
    setOfflineUser(null)
    const original = client().organization.getInvitation.getMockImplementation()
    if (original === undefined) throw new Error('Missing invitation fixture implementation')
    client().organization.getInvitation.mockImplementationOnce((...args) => {
      expect(currentOfflineUser()).toBe(VIEWER.id)
      return original(...args)
    })
    renderApp('/accept-invitation/inv-9')
    await screen.findByRole('button', { name: 'Accept invitation' })
    act(() => {
      setOfflineUser(OWNER.id)
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    })
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument()
    expect(client().organization.acceptInvitation).not.toHaveBeenCalled()
  })
  it('does not activate another account workspace when the account changes during invitation acceptance', async () => {
    const ui = userEvent.setup()
    seedInvitationFor(VIEWER)
    const original = client().organization.acceptInvitation.getMockImplementation()
    if (original === undefined) throw new Error('Missing acceptance fixture implementation')
    client().organization.acceptInvitation.mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      setOfflineUser(OWNER.id)
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      return result
    })
    renderApp('/accept-invitation/inv-9')
    await ui.click(await screen.findByRole('button', { name: 'Accept invitation' }))
    expect(client().organization.setActive).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument()
  })
  it('lets the invitee decline', async () => {
    const user = userEvent.setup()
    seedInvitationFor(VIEWER)
    const { router } = renderApp('/accept-invitation/inv-9')
    await user.click(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(client().organization.rejectInvitation).toHaveBeenCalledWith({ invitationId: 'inv-9' })
  })

  it('shows a failed acceptance', async () => {
    const user = userEvent.setup()
    seedInvitationFor(VIEWER)
    client().organization.acceptInvitation.mockImplementationOnce(() =>
      failure('Invitation expired'),
    )
    renderApp('/accept-invitation/inv-9')
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation expired')
  })

  it('asks visitors to sign in first and returns them to the invitation', async () => {
    const { router } = renderApp('/accept-invitation/inv-9')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: '/accept-invitation/inv-9' })
  })
})

describe('error paths in the workspace', () => {
  it('reports a failed invitation and a failed removal inline', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    client().organization.inviteMember.mockImplementationOnce(() => failure('Seat limit reached'))
    client().organization.removeMember.mockImplementationOnce(() => failure('Cannot remove'))
    renderApp('/app/members')
    await screen.findByRole('heading', { level: 1 })

    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Seat limit reached')

    await user.click(screen.getByRole('button', { name: `Remove ${VIEWER.name}` }))
    expect(await screen.findByText('Cannot remove')).toBeInTheDocument()
  })

  it('validates the invitation email before sending', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    renderApp('/app/members')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(client().organization.inviteMember).not.toHaveBeenCalled()
  })

  it('shows an empty audit trail and a generic failure', async () => {
    seedOwnerWorkspace(client())
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ entries: [] }))),
    )
    renderApp('/app/audit')
    expect(await screen.findByText('Nothing recorded yet.')).toBeInTheDocument()

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: HTTP_STATUS.internalServerError }))),
    )
    renderApp('/app/audit')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the audit log')
  })
})
