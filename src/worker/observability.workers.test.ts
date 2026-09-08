/**
 * Runs inside workerd with real D1: proves the observability store's Drizzle
 * queries and the scheduled health-check handler against the actual runtime
 * (the Node route tests use the in-memory double).
 */
import { env } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { runHealthCheck } from './index'
import { getServices } from './services'

describe('observability store on D1', () => {
  it('records and lists client errors', async () => {
    const { observability } = getServices(env)
    await observability.recordClientError({
      message: 'first',
      source: null,
      route: '/a',
      userAgent: null,
      requestId: null,
      userId: null,
    })
    await observability.recordClientError({
      message: 'second',
      source: 'at x (a.js:1:2)',
      route: '/b',
      userAgent: 'ua',
      requestId: 'req-9',
      userId: null,
    })
    const rows = await observability.listClientErrors()
    expect(rows.map((row) => row.message)).toEqual(expect.arrayContaining(['first', 'second']))
    const second = rows.find((row) => row.message === 'second')
    expect(second).toMatchObject({ source: 'at x (a.js:1:2)', route: '/b', requestId: 'req-9' })
  })

  it('records and lists health checks', async () => {
    const { observability } = getServices(env)
    await observability.recordHealthCheck({ ok: false, detail: 'db unreachable', durationMs: 7 })
    const rows = await observability.listHealthChecks()
    const failure = rows.find((row) => row.detail === 'db unreachable')
    expect(failure).toMatchObject({ ok: false, durationMs: 7 })
  })

  it('the health check records a successful result against the real database', async () => {
    const priorRows = await getServices(env).observability.listHealthChecks()
    await runHealthCheck(env)
    const rows = await getServices(env).observability.listHealthChecks()
    expect(rows.length).toBeGreaterThan(priorRows.length)
    expect(rows[0]).toMatchObject({ ok: true, detail: null })
  })
})
