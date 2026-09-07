#!/usr/bin/env node
/**
 * Lighthouse certification for UI milestones (PLAN.md §5.5 budgets).
 *
 * Runs against a preview server that is already listening on APP_URL:
 *   npm run build && npm run db:migrate:local && npm run preview
 * then, in another terminal:
 *   node scripts/lighthouse.mjs <milestone> [desktop|mobile]
 *
 * `desktop` (the default) uses Lighthouse's desktop preset; `mobile` uses
 * its default emulation (a mid-range Android phone on slow 4G with a 4x
 * CPU slowdown), which is the harsher of the two and has its own budgets.
 *
 * Public pages are audited directly. For the authenticated dashboard the
 * script signs up a throwaway user through the API, verifies it through the
 * development mailbox (console email provider only), and passes the session
 * cookie to Lighthouse. Fails with exit code 1 if any budget is missed.
 * Reports land in docs/lighthouse/<milestone>/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { startCompressingProxy } from './lib/compressing-proxy.mjs'
import { waitForLink } from './lib/dev-mailbox.mjs'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173'
const MILESTONE = process.argv[2] ?? 'm1'
const FORM_FACTOR = process.argv[3] ?? 'desktop'
if (FORM_FACTOR !== 'desktop' && FORM_FACTOR !== 'mobile') {
  throw new Error(`form factor must be desktop or mobile, not ${FORM_FACTOR}`)
}
/** PLAN.md 5.5: the mobile row allows for the simulated slow phone and network. */
const BUDGETS = {
  desktop: { performance: 0.9, accessibility: 0.95, 'best-practices': 0.95 },
  mobile: { performance: 0.85, accessibility: 0.95, 'best-practices': 0.95 },
}[FORM_FACTOR]
const REPORT_DIR = path.join('docs', 'lighthouse', MILESTONE, FORM_FACTOR)
/**
 * Pages are audited through a brotli proxy (scripts/lib/compressing-proxy.mjs)
 * because the preview serves uncompressed bytes and production does not;
 * sessions are still created against the preview itself. Cookies ignore
 * ports, so the session set on localhost:5173 is sent to the proxy too.
 */
const PROXY_PORT = 5199
const PUBLIC_PAGES = ['/', '/login', '/signup']
const AUTHENTICATED_PAGES = [
  '/app',
  '/app/members',
  '/app/audit',
  '/app/library',
  '/app/library/new',
  '/app/editor',
  '/app/bulk',
  '/app/gallery',
  '/app/admin',
]

async function api(pathname, init = {}, cookie = '') {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: BASE_URL,
      ...(cookie !== '' && { cookie }),
      ...init.headers,
    },
    redirect: 'manual',
  })
  return response
}

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(';', 1)[0])
    .filter((pair) => pair.length > 0)
    .join('; ')
}

async function createSession() {
  const runId = Date.now().toString(36)
  const email = `lighthouse-${runId}@example.test`
  const password = 'lighthouse audit passphrase'
  const signUp = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: 'Lighthouse Auditor', email, password }),
  })
  if (!signUp.ok) {
    throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`)
  }
  const link = await waitForLink(
    async () => {
      const response = await api('/api/dev/mailbox')
      return await response.json()
    },
    email,
    '/api/auth/verify-email',
  )
  const verified = await api(new URL(link).pathname + new URL(link).search)
  let cookie = cookieFrom(verified)
  if (cookie === '') {
    throw new Error('verification did not produce a session cookie')
  }
  const organization = await api(
    '/api/auth/organization/create',
    {
      method: 'POST',
      body: JSON.stringify({ name: 'Lighthouse Org', slug: `lighthouse-${runId}` }),
    },
    cookie,
  )
  if (!organization.ok) {
    throw new Error(`organization create failed: ${organization.status}`)
  }
  const { id } = await organization.json()
  const activated = await api(
    '/api/auth/organization/set-active',
    { method: 'POST', body: JSON.stringify({ organizationId: id }) },
    cookie,
  )
  const refreshed = cookieFrom(activated)
  if (refreshed !== '') {
    cookie = refreshed
  }
  // The admin console is part of the audited surface; the role is read from
  // the database on every request, so the promotion applies to this session.
  const promoted = await api('/api/dev/promote', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (!promoted.ok) {
    throw new Error(`promotion failed: ${promoted.status}`)
  }
  return { cookie, organizationId: id }
}

/** Smallest valid PNG: 1×1 opaque pixel; enough for the signature check and a thumbnail. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Stores one photo and publishes it, so the public share page has content to audit. */
async function createSharePath(cookie, organizationId) {
  const form = new FormData()
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'audit.png')
  form.append('thumbnail', new Blob([TINY_PNG], { type: 'image/png' }), 'thumb.png')
  form.append('name', 'Lighthouse photo')
  form.append('width', '1')
  form.append('height', '1')
  const uploaded = await fetch(`${BASE_URL}/api/orgs/${organizationId}/photos`, {
    method: 'POST',
    headers: { origin: BASE_URL, cookie },
    body: form,
  })
  if (!uploaded.ok) {
    throw new Error(`photo upload failed: ${uploaded.status}`)
  }
  const photo = await uploaded.json()
  const shared = await api(
    `/api/orgs/${organizationId}/shares`,
    { method: 'POST', body: JSON.stringify({ title: 'Lighthouse album', photoIds: [photo.id] }) },
    cookie,
  )
  if (!shared.ok) {
    throw new Error(`share create failed: ${shared.status}`)
  }
  const share = await shared.json()
  return new URL(share.url).pathname
}

const MAX_ATTEMPTS = 3
/**
 * Simulated throttling still starts from observed server timings, which
 * jitter on a workstation; the median of three runs per page is what
 * Lighthouse CI reports and what the budgets are judged on.
 */
const RUNS_PER_PAGE = Number(process.env.LIGHTHOUSE_RUNS ?? '3')

/** The run whose performance score is the median; ties go to the earlier run. */
function medianRun(runs) {
  const sorted = runs.toSorted((a, b) => a.scores.performance - b.scores.performance)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

async function auditMedian(origin, chrome, pathname, cookie, slugOverride = null) {
  const runs = []
  for (let run = 0; run < RUNS_PER_PAGE; run += 1) {
    const sample = await audit(origin, chrome, pathname, cookie, 1, slugOverride)
    if (sample !== null) {
      runs.push(sample)
    }
  }
  if (runs.length === 0) {
    throw new Error(`${pathname}: no run produced a trace`)
  }
  const chosen = medianRun(runs)
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(path.join(REPORT_DIR, `${chosen.slug}.html`), chosen.report)
  return chosen.scores
}

async function audit(origin, chrome, pathname, cookie, attempt = 1, slugOverride = null) {
  // Desktop preset: 40 ms RTT, 10 Mbps, no CPU slowdown. Mobile: Lighthouse's
  // default config, which emulates a phone screen, slow 4G and a 4x slower CPU.
  const result = await lighthouse(
    `${origin}${pathname}`,
    {
      port: chrome.port,
      output: 'html',
      logLevel: 'error',
      onlyCategories: Object.keys(BUDGETS),
      extraHeaders: cookie === '' ? undefined : { Cookie: cookie },
    },
    FORM_FACTOR === 'desktop' ? desktopConfig : undefined,
  )
  if (result === undefined) {
    throw new Error(`lighthouse produced no result for ${pathname}`)
  }
  if (result.lhr.runtimeError !== undefined) {
    // Trace capture occasionally fails (NO_NAVSTART); Lighthouse itself says
    // to rerun. A sample that never traces is dropped; the median needs one.
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`retrying ${pathname}: ${result.lhr.runtimeError.code}`)
      return await audit(origin, chrome, pathname, cookie, attempt + 1, slugOverride)
    }
    console.warn(`dropping a sample of ${pathname}: ${result.lhr.runtimeError.code}`)
    return null
  }
  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, category]) => [key, category.score ?? 0]),
  )
  const slug =
    slugOverride ?? (pathname === '/' ? 'home' : pathname.replaceAll('/', '-').replace(/^-/, ''))
  return { scores, slug, report: result.report }
}

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'],
})
const proxy = await startCompressingProxy({ upstream: BASE_URL, port: PROXY_PORT })
try {
  const { cookie, organizationId } = await createSession()
  const rows = []
  let hasFailure = false
  for (const pathname of PUBLIC_PAGES) {
    rows.push([pathname, await auditMedian(proxy.origin, chrome, pathname, '')])
  }
  for (const pathname of AUTHENTICATED_PAGES) {
    rows.push([pathname, await auditMedian(proxy.origin, chrome, pathname, cookie)])
  }
  const sharePath = await createSharePath(cookie, organizationId)
  rows.push([
    '/share/<token>',
    await auditMedian(proxy.origin, chrome, sharePath, '', 'share-token'),
  ])
  const summary = [
    '| Page | Performance | Accessibility | Best practices |',
    '| --- | --- | --- | --- |',
  ]
  for (const [pathname, scores] of rows) {
    const cells = Object.entries(BUDGETS).map(([key, budget]) => {
      const score = scores[key] ?? 0
      const isOk = score >= budget
      hasFailure ||= !isOk
      return `${Math.round(score * 100)}${isOk ? '' : ' ❌'}`
    })
    summary.push(`| \`${pathname}\` | ${cells.join(' | ')} |`)
  }
  const table = summary.join('\n')
  await writeFile(path.join(REPORT_DIR, 'summary.md'), `${table}\n`)
  console.info(`${FORM_FACTOR}\n${table}`)
  if (hasFailure) {
    console.error(`Lighthouse ${FORM_FACTOR} budget missed (PLAN.md §5.5)`)
    process.exitCode = 1
  }
} finally {
  await proxy.close()
  try {
    await chrome.kill()
  } catch (error) {
    // chrome-launcher removes its temp profile after killing Chrome; on
    // Windows the process can still hold the directory for a moment. The
    // audit results are already written, so a cleanup failure is a warning.
    console.warn(`chrome cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
