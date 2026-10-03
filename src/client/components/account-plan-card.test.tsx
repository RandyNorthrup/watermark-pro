import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountPlanCard } from './account-plan-card'
import { billingCheckoutRequestSchema, billingOverviewSchema } from '../../shared/billing-client'
import { PUBLIC_PLANS } from '../../shared/plans'
import type * as ApiModule from '../lib/api'
import { fetchJson } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  fetchJson: vi.fn(),
}))
const identity = { userId: 'billing-user', organizationId: 'selected-other-workspace' } as const
const fetch = vi.mocked(fetchJson)
const personal = {
  organizationId: 'own-personal',
  workspaceName: 'Own photos',
  kind: 'personal',
  plan: 'free',
  subscriptionStatus: 'none',
  paidThrough: null,
  suspended: false,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
  canCheckout: true,
  checkoutState: 'none',
} as const

function fixture({
  configured = true,
  canCheckout = true,
  team = null,
}: {
  configured?: boolean
  canCheckout?: boolean
  team?: typeof personal | null | Record<string, unknown>
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const state = billingOverviewSchema.parse({
    configured,
    personal: { ...personal, canCheckout },
    team,
  })
  queryClient.setQueryData(['billing-overview', identity.userId], state)
  queryClient.setQueryData(['workspace-capacity', identity.userId, identity.organizationId], {
    storageBytes: PUBLIC_PLANS.free.storageBytes,
    photos: PUBLIC_PLANS.free.photos,
    logos: PUBLIC_PLANS.free.logos,
    presets: PUBLIC_PLANS.free.presets,
    members: 1,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountPlanCard {...identity} />
    </QueryClientProvider>,
  )
  return state
}

beforeEach(() => {
  fetch.mockReset()
  fetch.mockRejectedValue(new Error('Fixture billing unavailable'))
})

describe('account financial scope from server overview', () => {
  it('shows the selected workspace saved-preset allowance independently of billing', () => {
    fixture({ configured: false })
    const label = screen.getByText('Saved Watermarks')
    expect(label.closest('div')).toHaveTextContent('20')
    expect(label.closest('div')).not.toHaveTextContent('1,000')
    expect(screen.getByText('Photos').closest('div')).toHaveTextContent('100')
    expect(screen.queryByText('Title')).toBeNull()
  })
  it('offers no payment mutation when server is unconfigured', () => {
    fixture({ configured: false })
    expect(screen.queryByRole('button', { name: 'Choose Pro' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses server checkout eligibility rather than selected workspace capacity', () => {
    fixture({ canCheckout: false })
    expect(screen.getByRole('button', { name: 'Choose Pro' })).toBeDisabled()
    expect(screen.getByText('Own photos')).toBeVisible()
  })
  it('retains failed Pro intent and sends no selected workspace identifier', async () => {
    fixture()
    const user = userEvent.setup()
    const choose = screen.getByRole('button', { name: 'Choose Pro' })
    await user.click(choose)
    await screen.findByRole('alert')
    await waitFor(() => expect(choose).toBeEnabled())
    await user.click(choose)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const bodies = fetch.mock.calls.map((call) => {
      if (typeof call[2]?.body !== 'string') throw new Error('Missing JSON fixture')
      return billingCheckoutRequestSchema.parse(JSON.parse(call[2].body))
    })
    expect(bodies[0]).toEqual(bodies[1])
    expect(Object.keys(bodies[0] ?? {})).toEqual(['requestId', 'plan'])
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/me/billing/checkout')
  })
  it('resumes fixed Team checkout and exposes explicit cancellation before another name', async () => {
    const state = fixture({
      team: {
        ...personal,
        kind: 'shared',
        plan: 'free',
        organizationId: null,
        workspaceName: 'Reserved Team',
        checkoutState: 'open',
      },
    })
    const user = userEvent.setup()
    const region = screen.getByRole('region', { name: 'Team' })
    expect(screen.queryByLabelText('New shared workspace name')).toBeNull()
    await user.click(within(region).getByRole('button', { name: 'Resume checkout' }))
    await screen.findByRole('alert')
    const firstBody = fetch.mock.calls[0]?.[2]?.body
    if (typeof firstBody !== 'string') throw new Error('Missing checkout intent')
    expect(billingCheckoutRequestSchema.parse(JSON.parse(firstBody))).toMatchObject({
      plan: 'team',
      newWorkspaceName: 'Reserved Team',
    })
    fetch.mockResolvedValueOnce({
      ...state,
      team: {
        ...state.team,
        checkoutState: 'expired',
        canCheckout: true,
      },
    })
    await user.click(within(region).getByRole('button', { name: 'Cancel checkout' }))
    const name = await screen.findByLabelText('New shared workspace name')
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/me/billing/checkout/cancel')
    expect(fetch.mock.calls[1]?.[2]?.body).toBe(JSON.stringify({ plan: 'team' }))
    const choose = within(region).getByRole('button', { name: 'Create a Team workspace' })
    expect(choose).toBeDisabled()
    await user.type(name, 'Renamed Team')
    await user.click(choose)
    await waitFor(() => expect(choose).toBeEnabled())
    await user.click(choose)
    const checkouts = fetch.mock.calls.filter((call) => call[0] === '/api/me/billing/checkout')
    const bodies = checkouts.map((call) => {
      if (typeof call[2]?.body !== 'string') throw new Error('Missing checkout intent')
      return billingCheckoutRequestSchema.parse(JSON.parse(call[2].body))
    })
    expect(bodies).toHaveLength(3)
    expect(bodies[1]).toMatchObject({ plan: 'team', newWorkspaceName: 'Renamed Team' })
    expect(bodies[2]).toEqual(bodies[1])
    expect(bodies[1]?.requestId).not.toBe(bodies[0]?.requestId)
  })
  it('takes a new name for retained closed Team authority after its old workspace was deleted', async () => {
    fixture({
      team: {
        ...personal,
        kind: 'shared',
        organizationId: null,
        workspaceName: null,
        subscriptionStatus: 'canceled',
        checkoutState: 'complete',
        canCheckout: true,
      },
    })
    const user = userEvent.setup()
    const region = screen.getByRole('region', { name: 'Team' })
    const choose = within(region).getByRole('button', { name: 'Create a Team workspace' })
    expect(choose).toBeDisabled()
    await user.type(screen.getByLabelText('New shared workspace name'), 'Replacement Team')
    await user.click(choose)
    await screen.findByRole('alert')
    const body = fetch.mock.calls[0]?.[2]?.body
    if (typeof body !== 'string') throw new Error('Missing replacement checkout intent')
    const request = billingCheckoutRequestSchema.parse(JSON.parse(body))
    expect(request).toMatchObject({
      plan: 'team',
      newWorkspaceName: 'Replacement Team',
    })
    expect(Object.keys(request)).toEqual(['requestId', 'plan', 'newWorkspaceName'])
  })
  it('keeps financial portal available for paid Team before any workspace exists', async () => {
    fixture({
      team: {
        ...personal,
        kind: 'shared',
        organizationId: null,
        workspaceName: null,
        subscriptionStatus: 'past_due',
        suspended: true,
        canManageBilling: true,
        canCheckout: false,
        checkoutState: 'complete',
      },
    })
    const user = userEvent.setup()
    const region = screen.getByRole('region', { name: 'Team' })
    await user.click(within(region).getByRole('button', { name: 'Manage subscription' }))
    await screen.findByRole('alert')
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/me/billing/portal')
    expect(fetch.mock.calls[0]?.[2]?.body).toBe(JSON.stringify({ plan: 'team' }))
    expect(within(region).getByRole('button', { name: 'Create a Team workspace' })).toBeDisabled()
    expect(screen.queryByLabelText('New shared workspace name')).toBeNull()
  })
  it('reconciles only on explicit POST action and never treats returned state as entitlement', async () => {
    const state = fixture()
    const user = userEvent.setup()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(state).mockResolvedValueOnce({
      storageBytes: PUBLIC_PLANS.free.storageBytes,
      photos: PUBLIC_PLANS.free.photos,
      logos: PUBLIC_PLANS.free.logos,
      members: 1,
    })
    await user.click(screen.getByRole('button', { name: 'Refresh payment status' }))
    await waitFor(() =>
      expect(fetch.mock.calls.filter((call) => call[2]?.method === 'POST')).toHaveLength(1),
    )
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/me/billing/reconcile')
    expect(fetch.mock.calls[0]?.[2]?.method).toBe('POST')
    expect(fetch.mock.calls[0]?.[2]?.body).toBe(JSON.stringify({ plan: 'pro' }))
  })
})
