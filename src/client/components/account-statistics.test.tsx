import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { AccountStatistics } from './account-statistics'
import { setOfflineUser } from '../lib/offline-context'

beforeEach(() => setOfflineUser('statistics-admin'))
afterEach(() => {
  setOfflineUser(null)
  vi.unstubAllGlobals()
})

function renderStatistics(response: Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AccountStatistics />
    </QueryClientProvider>,
  )
}

it('keeps every metric label present while real totals are pending, without inventing zeroes', async () => {
  const response = Promise.withResolvers<Response>()
  renderStatistics(response.promise)
  for (const label of [
    'Registered accounts',
    'Verified accounts',
    'Pending invitations',
    'Accepted invitations',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getAllByRole('status')).toHaveLength(4)
  expect(screen.queryByText('0')).not.toBeInTheDocument()
  await act(async () => {
    response.resolve(
      Response.json({ users: 3, verifiedUsers: 2, pendingInvitations: 1, acceptedInvitations: 5 }),
    )
    await response.promise
  })
  await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0))
  expect(screen.getByText('Registered accounts').nextElementSibling).toHaveTextContent('3')
  expect(screen.getByText('Verified accounts').nextElementSibling).toHaveTextContent('2')
})

it('shows an actual totals failure without successful-looking counts', async () => {
  renderStatistics(Promise.resolve(Response.json({ error: 'unavailable' }, { status: 503 })))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})
