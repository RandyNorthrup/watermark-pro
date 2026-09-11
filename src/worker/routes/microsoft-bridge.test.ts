import { describe, expect, it, vi } from 'vitest'

import { serveMicrosoftBridge } from './microsoft-bridge'

const ORIGIN = 'https://lumafoil.example'
const DOCUMENT = '<main id="microsoft-redirect-bridge"><h1>Connecting OneDrive</h1></main>'

function assets(body = DOCUMENT, type = 'text/html', status = 200) {
  const fetch = vi.fn((_request: Request) =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: {
          'Content-Type': type,
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
          'X-Frame-Options': 'DENY',
        },
      }),
    ),
  )
  return { ASSETS: { fetch } }
}

describe('Microsoft redirect bridge response', () => {
  it.each(['/oauth/microsoft', '/oauth/microsoft/', '/oauth/microsoft.html'])(
    'serves %s without forwarding callback material or booting the app',
    async (path) => {
      const env = assets()
      const response = await serveMicrosoftBridge(
        new Request(`${ORIGIN}${path}?code=private-code&state=private-state`, {
          headers: { Cookie: 'private-cookie', Authorization: 'Bearer private-token' },
        }),
        env,
      )
      expect(response?.status).toBe(200)
      expect(await response?.text()).toBe(DOCUMENT)
      const forwarded = env.ASSETS.fetch.mock.calls[0]?.[0]
      expect(forwarded?.url).toBe(`${ORIGIN}/oauth/microsoft`)
      expect([...(forwarded?.headers ?? [])]).toEqual([])
      expect(response?.headers.get('Cache-Control')).toBe('no-store')
      expect(response?.headers.has('Cross-Origin-Opener-Policy')).toBe(false)
      expect(response?.headers.has('Cross-Origin-Embedder-Policy')).toBe(false)
      expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(response?.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
      expect(response?.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'")
      expect(response?.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline')
    },
  )

  it('serves its bundled script and HEAD document with the same private response policy', async () => {
    const script = await serveMicrosoftBridge(
      new Request(`${ORIGIN}/oauth/microsoft-bridge.js`),
      assets('/* bundled SDK */', 'text/javascript'),
    )
    expect(script?.status).toBe(200)
    expect(script?.headers.get('Cache-Control')).toBe('no-store')
    const head = await serveMicrosoftBridge(
      new Request(`${ORIGIN}/oauth/microsoft`, { method: 'HEAD' }),
      assets(),
    )
    expect(head?.status).toBe(200)
    expect(await head?.text()).toBe('')
  })

  it.each([
    ['<div id="root">SPA fallback</div>', 'text/html', 200],
    ['private error details', 'text/plain', 500],
    [DOCUMENT, 'text/html', 302],
  ] as const)(
    'fails closed on an absent or invalid dedicated asset',
    async (body, type, status) => {
      const response = await serveMicrosoftBridge(
        new Request(`${ORIGIN}/oauth/microsoft`),
        assets(body, type, status),
      )
      expect(response?.status).toBe(503)
      expect(await response?.text()).toBe('')
      expect(response?.headers.get('Cache-Control')).toBe('no-store')
      expect(response?.headers.has('Strict-Transport-Security')).toBe(true)
    },
  )

  it('rejects HTML pretending to be the bridge script and hides asset binding failures', async () => {
    const response = await serveMicrosoftBridge(
      new Request(`${ORIGIN}/oauth/microsoft-bridge.js`),
      assets(),
    )
    expect(response?.status).toBe(503)
    const env = assets()
    env.ASSETS.fetch.mockRejectedValue(new Error('Private upstream detail'))
    const unavailable = await serveMicrosoftBridge(new Request(`${ORIGIN}/oauth/microsoft`), env)
    expect(unavailable?.status).toBe(503)
    expect(await unavailable?.text()).toBe('')
  })

  it('refuses unsupported methods and leaves all other routes untouched', async () => {
    const env = assets()
    const response = await serveMicrosoftBridge(
      new Request(`${ORIGIN}/oauth/microsoft`, { method: 'POST', body: 'private-code' }),
      env,
    )
    expect(response?.status).toBe(405)
    expect(response?.headers.get('Allow')).toBe('GET, HEAD')
    for (const path of [
      '/login',
      '/api/auth/callback/microsoft',
      '/oauth/microsoft-other',
      '/oauth/dropbox',
    ])
      expect(await serveMicrosoftBridge(new Request(`${ORIGIN}${path}`), env)).toBeNull()
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
  })
})
