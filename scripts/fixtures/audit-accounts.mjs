import { randomUUID } from 'node:crypto'

import { request } from '@playwright/test'

import { waitForLink } from '../lib/dev-mailbox.mjs'

/** Fixture writes can only target the explicitly isolated loopback console-mailbox gate. */
export function auditOrigin(value) {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  )
    throw new Error('Audit fixtures require a loopback HTTP origin')
  return url.origin
}

/** Reject unexpected fixture responses without publishing their bodies or identity-bearing paths. */
export async function fixtureJson(response) {
  if (!response.ok()) throw new Error(`Audit fixture request failed with HTTP ${response.status()}`)
  return await response.json()
}

/** Resolve a real mailbox link while keeping bearer paths and recipient identities out of diagnostics. */
export async function fixtureLink(context, origin, email, fragment) {
  const base = auditOrigin(origin)
  const link = new URL(
    await waitForLink(
      async () => await fixtureJson(await context.get('/api/dev/mailbox')),
      email,
      fragment,
    ),
  )
  if (link.origin !== base || link.username !== '' || link.password !== '' || link.hash !== '')
    throw new Error('Audit fixture email returned an unexpected link origin')
  return `${link.pathname}${link.search}`
}

/** Creates a real verified standard account; it never promotes or joins another workspace. */
export async function createAuditAccount(origin, name = 'Sam Audit') {
  const base = auditOrigin(origin)
  const person = {
    name,
    email: `audit-${randomUUID()}@example.test`,
    password: 'disposable audit account passphrase',
  }
  const context = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } })
  try {
    const mailbox = await fixtureJson(await context.get('/api/dev/mailbox'))
    if (!Array.isArray(mailbox.messages))
      throw new Error('A console-mailbox audit gate is required')
    await fixtureJson(
      await context.post('/api/auth/sign-up/email', { data: { ...person, callbackURL: '/app' } }),
    )
    const verification = await fixtureLink(context, base, person.email, '/api/auth/verify-email')
    const verified = await context.get(verification, { maxRedirects: 0 })
    if (verified.status() !== 302) throw new Error('Audit account email verification failed')
    await fixtureJson(await context.post('/api/auth/sign-in/email', { data: person }))
    const workspace = await fixtureJson(await context.post('/api/me/workspace', { data: {} }))
    if (typeof workspace.organizationId !== 'string')
      throw new Error('Audit account has no private workspace')
    return { context, person, organizationId: workspace.organizationId }
  } catch (error) {
    await context.dispose()
    throw error
  }
}

/** Resolve the real one-use reset redirect without consuming its form token. */
export async function createAuditReset(context, origin, email) {
  const base = auditOrigin(origin)
  await fixtureJson(
    await context.post('/api/auth/request-password-reset', {
      // BrowserContext.request inherits its cookies but need not have the
      // Origin default installed on standalone account-setup contexts.
      headers: { origin: base },
      data: { email, redirectTo: '/reset-password' },
    }),
  )
  const link = await fixtureLink(context, base, email, '/api/auth/reset-password/')
  const response = await context.get(link, { maxRedirects: 0 })
  const location = response.headers().location
  if (location === undefined || response.status() !== 302)
    throw new Error('Audit password reset did not produce its form redirect')
  const destination = new URL(location, base)
  if (
    destination.origin !== base ||
    destination.pathname !== '/reset-password' ||
    !destination.searchParams.has('token') ||
    destination.searchParams.has('error')
  )
    throw new Error('Audit password reset returned an unexpected destination')
  return `${destination.pathname}${destination.search}`
}

/** Return fixture session cookies in memory for the audit's explicitly scoped browser origin. */
export async function auditCookies(context) {
  const state = await context.storageState()
  return state.cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
}
