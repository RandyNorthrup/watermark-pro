import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { publicConfigQueryOptions } from './queries'
import { createQueryClient } from './query-client'
import { useCaptcha } from './use-captcha'
import { NO_CLOUD_CONFIG } from '../test-support/cloud-config'

afterEach(() => vi.unstubAllGlobals())

function show() {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { ...renderHook(useCaptcha, { wrapper }), client }
}

describe('form human verification readiness', () => {
  it('blocks unresolved configuration and allows challenge-free development only after a successful response', async () => {
    const response = Promise.withResolvers<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise),
    )
    const { result, client } = show()
    expect(result.current.isReady).toBe(false)
    expect(result.current.headers).toEqual({})
    response.resolve(Response.json(NO_CLOUD_CONFIG))
    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.siteKey).toBeNull()
    client.clear()
  })

  it('keeps failed configuration closed rather than interpreting it as a disabled challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Fixture offline'))),
    )
    const { result, client } = show()
    await waitFor(() => expect(result.current.isUnavailable).toBe(true))
    expect(result.current.isReady).toBe(false)
    expect(result.current.headers).toEqual({})
    client.clear()
  })

  it('requires a fresh token after each attempt and after expiration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            ...NO_CLOUD_CONFIG,
            turnstileSiteKey: 'fixture-site-key',
          }),
        ),
      ),
    )
    const { result, client } = show()
    await waitFor(() => expect(result.current.siteKey).toBe('fixture-site-key'))
    expect(result.current.isReady).toBe(false)
    act(() => result.current.onToken(''))
    expect(result.current.isReady).toBe(false)
    act(() => result.current.onToken('first-fixture-token'))
    expect(result.current.isReady).toBe(true)
    expect(result.current.headers).toEqual({ 'x-captcha-response': 'first-fixture-token' })
    act(() => result.current.reset())
    expect(result.current.isReady).toBe(false)
    expect(result.current.generation).toBe(1)
    expect(result.current.headers).toEqual({})
    act(() => result.current.onToken('second-fixture-token'))
    expect(result.current.isReady).toBe(true)
    act(() => result.current.onToken(null))
    expect(result.current.isReady).toBe(false)
    expect(result.current.headers).toEqual({})
    expect(client.getQueryData(publicConfigQueryOptions.queryKey)).toBeDefined()
    client.clear()
  })
})
