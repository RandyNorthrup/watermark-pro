/** Better Auth's organization and account actions obey the same rendered-account boundary as custom APIs. */
import type { FetchHooks } from 'better-auth/client'

import {
  captureOfflineGeneration,
  captureOfflineOwner,
  currentOfflineUser,
} from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'

const AUTH_ACCOUNT_PATHS = new Set([
  '/account-info',
  '/get-access-token',
  '/refresh-token',
  '/list-accounts',
  '/link-social',
  '/unlink-account',
  '/update-user',
  '/update-session',
  '/verify-password',
  '/change-email',
  '/change-password',
  '/set-password',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/delete-user',
  '/sign-out',
])

const HOOK_NAMES = ['onRequest', 'onResponse', 'onSuccess', 'onError', 'onRetry'] as const

function authPath(input: string): string {
  const methodless = input.replace(/^@(?:get|post|put|patch|delete)\//, '/')
  const url = new URL(methodless, window.location.origin)
  if (url.origin !== window.location.origin)
    throw new Error('Account requests must stay on this site.')
  return url.pathname.replace(/^\/api\/auth(?=\/|$)/, '').replace(/\/+$/, '')
}

function isAccountAction(path: string): boolean {
  return (
    path.startsWith('/organization/') || path.startsWith('/admin/') || AUTH_ACCOUNT_PATHS.has(path)
  )
}

function optionRecord(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Authentication options must be an object')
  return { ...input }
}

function assertSessionIdentity(data: unknown, expectedUserId: string | null): void {
  if (data === null) return
  if (typeof data !== 'object' || !('user' in data) || !('session' in data))
    throw new Error('The session response is invalid.')
  const { user, session } = data
  if (user === null && session === null) return
  if (
    user === null ||
    session === null ||
    typeof user !== 'object' ||
    typeof session !== 'object' ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('userId' in session) ||
    session.userId !== user.id
  )
    throw new Error('The session response is invalid.')
  if (expectedUserId !== null && user.id !== expectedUserId)
    throw new Error('The signed-in account changed. Sign in again to continue.')
}

function guardedOptions(
  input: Record<string, unknown>,
  assertCurrent: () => void,
  sessionUserId: string | null | undefined,
): Record<string, unknown> {
  const options = { ...input }
  for (const name of HOOK_NAMES) {
    const callback = options[name]
    if (callback !== undefined && typeof callback !== 'function')
      throw new TypeError('Authentication lifecycle callbacks must be functions')
    options[name] = async (...args: unknown[]) => {
      assertCurrent()
      if (name === 'onSuccess' && sessionUserId !== undefined) {
        const context = optionRecord(args[0])
        assertSessionIdentity(context['data'], sessionUserId)
      }
      const result: unknown =
        callback === undefined ? undefined : Reflect.apply(callback, undefined, args)
      const settled: unknown = await result
      assertCurrent()
      return settled
    }
  }
  return options
}

/** Wrap callbacks before Better Auth inserts its own per-call hook, which precedes global fetch hooks. */
export function withAuthAccountBoundary<T extends object>(client: T): T {
  function wrap<U extends object>(value: U, path: string[]): U {
    const get = (target: U, key: string | symbol, receiver: unknown): unknown => {
      const result: unknown = Reflect.get(target, key, receiver)
      if (typeof key !== 'string' || key === 'then') return result
      const next = [...path, key]
      // SDK atoms/hooks and local permission helpers are not HTTP methods.
      if (
        key === 'hydrateSession' ||
        key === 'checkRolePermission' ||
        (key !== '$fetch' && key.startsWith('$')) ||
        /^use[A-Z]/.test(key)
      )
        return result
      return typeof result === 'function' || (result !== null && typeof result === 'object')
        ? wrap(result, next)
        : result
    }
    if (typeof value !== 'function') return new Proxy(value, { get })
    const callable = value
    return new Proxy(value, {
      get,
      apply(_target, receiver: unknown, args: unknown[]): unknown {
        const isRawFetch = path.length === 1 && path[0] === '$fetch'
        const first = args[0]
        if (isRawFetch && typeof first !== 'string')
          throw new TypeError('Authentication request path must be a string')
        const route =
          isRawFetch && typeof first === 'string'
            ? authPath(first)
            : `/${path.map((part) => part.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)).join('/')}`
        if (route !== '/get-session' && !isAccountAction(route)) {
          const result: unknown = Reflect.apply(callable, receiver, args)
          return result
        }
        return (async () => {
          const sessionUserId = route === '/get-session' ? currentOfflineUser() : undefined
          const owner =
            route === '/get-session' ? captureOfflineGeneration() : captureOfflineOwner()
          const second = optionRecord(args[1])
          const next = [...args]
          if (isRawFetch) next[1] = guardedOptions(second, owner.assertCurrent, sessionUserId)
          else {
            const body = optionRecord(first)
            next[0] = {
              ...body,
              fetchOptions: guardedOptions(
                { ...second, ...optionRecord(body['fetchOptions']) },
                owner.assertCurrent,
                sessionUserId,
              ),
            }
          }
          owner.assertCurrent()
          const response: unknown = Reflect.apply(callable, receiver, next)
          const settled: unknown = await response
          owner.assertCurrent()
          return settled
        })()
      },
    })
  }
  return wrap(client, [])
}

/** Request contexts retain identity through Better Fetch's response and success hooks. */
export function createAuthAccountHooks(): Pick<
  FetchHooks,
  'onRequest' | 'onResponse' | 'onSuccess' | 'onError'
> {
  const owners = new WeakMap<object, { assertCurrent: () => void; sessionUserId?: string | null }>()
  return {
    onRequest(context) {
      const path = authPath(String(context.url))
      if (path === '/get-session') {
        const userId = currentOfflineUser()
        owners.set(context, {
          assertCurrent: captureOfflineGeneration().assertCurrent,
          sessionUserId: userId,
        })
        const expected = context.headers.get(ACCOUNT_ID_HEADER)
        if (userId === null) context.headers.delete(ACCOUNT_ID_HEADER)
        else {
          if (expected !== null && expected !== userId)
            throw new Error('The signed-in account changed before this request started.')
          context.headers.set(ACCOUNT_ID_HEADER, userId)
        }
        return
      }
      if (!isAccountAction(path)) {
        context.headers.delete(ACCOUNT_ID_HEADER)
        return
      }
      const owner = captureOfflineOwner()
      const expected = context.headers.get(ACCOUNT_ID_HEADER)
      if (expected !== null && expected !== owner.userId)
        throw new Error('The signed-in account changed before this request started.')
      owners.set(context, { assertCurrent: owner.assertCurrent })
      context.headers.set(ACCOUNT_ID_HEADER, owner.userId)
      owner.assertCurrent()
    },
    onResponse(context) {
      owners.get(context.request)?.assertCurrent()
    },
    onSuccess(context) {
      const owner = owners.get(context.request)
      owner?.assertCurrent()
      if (owner?.sessionUserId !== undefined)
        assertSessionIdentity(context.data, owner.sessionUserId)
      owners.delete(context.request)
    },
    onError(context) {
      owners.get(context.request)?.assertCurrent()
      owners.delete(context.request)
    },
  }
}
