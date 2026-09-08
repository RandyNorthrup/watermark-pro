import { describe, expect, it } from 'vitest'

import { type AssetsEnv, serveLanding } from './landing'
import { HTTP_STATUS } from '../../shared/constants'

const ORIGIN = 'https://watermark.blowmoney.net'

/**
 * Fake asset store: serves a 200 for the landing files it knows and for the SPA
 * shell, a 404 for anything else. Records the paths it was asked for so a test
 * can assert which locale was served.
 */
function fakeAssets(known: readonly string[]): AssetsEnv & { requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ASSETS: {
      fetch: (request: Request) => {
        const { pathname } = new URL(request.url)
        requested.push(pathname)
        if (pathname === '/index.html' || known.includes(pathname)) {
          return Promise.resolve(new Response(`asset:${pathname}`, { status: HTTP_STATUS.ok }))
        }
        return Promise.resolve(new Response('not found', { status: HTTP_STATUS.notFound }))
      },
    },
  }
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers })
}

describe('serveLanding', () => {
  it('defers non-root and non-GET requests to the API app', async () => {
    const env = fakeAssets([])
    expect(await serveLanding(get('/api/health'), env)).toBeNull()
    expect(await serveLanding(get('/login'), env)).toBeNull()
    expect(await serveLanding(new Request(`${ORIGIN}/`, { method: 'POST' }), env)).toBeNull()
    expect(env.requested).toEqual([])
  })

  it('persists a valid ?lang choice in the cookie and reloads', async () => {
    const env = fakeAssets([])
    const response = await serveLanding(get('/?lang=es'), env)
    expect(response?.status).toBe(HTTP_STATUS.found)
    expect(response?.headers.get('location')).toBe('/')
    const cookie = response?.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('watermark-pro-locale=es')
    expect(cookie).toContain('Secure')
    expect(env.requested).toEqual([])
  })

  it('falls back to English for an unsupported ?lang', async () => {
    const response = await serveLanding(get('/?lang=klingon'), fakeAssets([]))
    expect(response?.headers.get('set-cookie')).toContain('watermark-pro-locale=en')
  })

  it('omits Secure over http', async () => {
    const response = await serveLanding(
      new Request('http://localhost:5273/?lang=de'),
      fakeAssets([]),
    )
    expect(response?.headers.get('set-cookie')).not.toContain('Secure')
  })

  it('sends a signed-in visitor to the app', async () => {
    const env = fakeAssets([])
    const response = await serveLanding(
      get('/', { cookie: '__Secure-better-auth.session_token=abc.def' }),
      env,
    )
    expect(response?.status).toBe(HTTP_STATUS.found)
    expect(response?.headers.get('location')).toBe('/app')
    expect(env.requested).toEqual([])
  })

  it('serves the cookie locale ahead of Accept-Language', async () => {
    const env = fakeAssets(['/landing/fr.html', '/landing/es.html'])
    const response = await serveLanding(
      get('/', { cookie: 'watermark-pro-locale=fr', 'accept-language': 'es,en' }),
      env,
    )
    expect(response?.status).toBe(HTTP_STATUS.ok)
    expect(env.requested).toEqual(['/landing/fr.html'])
  })

  it('negotiates from Accept-Language when no cookie is set', async () => {
    const env = fakeAssets(['/landing/es.html'])
    await serveLanding(get('/', { 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' }), env)
    expect(env.requested).toEqual(['/landing/es.html'])
  })

  it('defaults to English when nothing matches', async () => {
    const env = fakeAssets(['/landing/en.html'])
    await serveLanding(get('/', { 'accept-language': 'xx,zz' }), env)
    expect(env.requested).toEqual(['/landing/en.html'])
  })

  it('falls back to the SPA shell when the prerender is absent', async () => {
    const env = fakeAssets([]) // no landing files, e.g. local dev / CI
    const response = await serveLanding(get('/', { 'accept-language': 'de' }), env)
    expect(response?.status).toBe(HTTP_STATUS.ok)
    expect(await response?.text()).toBe('asset:/index.html')
    expect(env.requested).toEqual(['/landing/de.html', '/index.html'])
  })
})
