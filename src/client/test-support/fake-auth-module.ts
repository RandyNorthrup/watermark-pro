/**
 * Drop-in replacement for `../lib/auth-client` in page tests:
 *   vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))
 * Every access is forwarded to the fake installed by `installFakeAuth()`, so
 * tests can create a fresh fake in `beforeEach` without re-mocking.
 */
import { createFakeAuthClient } from './fake-auth-client'

export type FakeAuthClient = ReturnType<typeof createFakeAuthClient>

const holder: { client: FakeAuthClient | null } = { client: null }

/** Creates and installs a fresh fake; call in `beforeEach`. */
export function installFakeAuth(): FakeAuthClient {
  holder.client = createFakeAuthClient()
  return holder.client
}

/** The fake currently installed; throws if a test forgot `installFakeAuth()`. */
export function fakeAuth(): FakeAuthClient {
  if (holder.client === null) {
    throw new Error('installFakeAuth() must run before the auth client is used')
  }
  return holder.client
}

export const authClient: FakeAuthClient = new Proxy({} as FakeAuthClient, {
  get: (_target, property: string | symbol): unknown => Reflect.get(fakeAuth(), property),
})
