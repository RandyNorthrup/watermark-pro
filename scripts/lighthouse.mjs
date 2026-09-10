#!/usr/bin/env node
/**
 * Lighthouse certification for UI milestones (PLAN.md §5.5 budgets).
 *
 * Runs against the isolated built-Worker gate listening on APP_URL:
 *   node scripts/gate-server.mjs
 * then, in another terminal:
 *   node scripts/lighthouse.mjs <milestone> [desktop|mobile]
 *
 * `desktop` (the default) uses Lighthouse's desktop preset; `mobile` uses
 * its default emulation (a mid-range Android phone on slow 4G with a 4x
 * CPU slowdown), which is the harsher of the two and has its own budgets.
 *
 * Every leaf route and required prepared state has a stable report label.
 * Standard-user work, administration, and matching-recipient invitations
 * use separate real synthetic sessions on the isolated console-mailbox gate.
 * Fails with exit code 1 if content verification or any budget is missed.
 * Reports land in docs/lighthouse/<milestone>/.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { prepareLighthouseSurfaces } from './fixtures/lighthouse-surfaces.mjs'
import { createAuditCertificate } from './lib/audit-certificate.mjs'
import { launchAuditChrome } from './lib/audit-chrome.mjs'
import { assertAuditContent } from './lib/audit-content.mjs'
import { AUDIT_SURFACES } from './lib/audit-surfaces.mjs'
import { startCompressingProxy } from './lib/compressing-proxy.mjs'
import {
  budgetFailures,
  LIGHTHOUSE_BUDGETS,
  LIGHTHOUSE_METRICS,
  LIGHTHOUSE_RUNS_PER_PAGE,
  summarizeRuns,
} from './lib/lighthouse-budget.mjs'
import { setAuditCookies } from './lib/lighthouse-cookies.mjs'
import { validateAuditNavigation } from './lib/lighthouse-navigation.mjs'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5273'
const MILESTONE = process.argv[2] ?? 'm19'
if (!/^[a-z][a-z0-9-]*$/.test(MILESTONE))
  throw new Error('Use a milestone name without path separators.')
const FORM_FACTOR = process.argv[3] ?? 'desktop'
if (FORM_FACTOR !== 'desktop' && FORM_FACTOR !== 'mobile') {
  throw new Error(`form factor must be desktop or mobile, not ${FORM_FACTOR}`)
}
const BUDGETS = LIGHTHOUSE_BUDGETS[FORM_FACTOR]
const IS_SAMPLE = process.env.LIGHTHOUSE_SAMPLE === '1'
const REPORT_DIR = path.join(
  'docs',
  'lighthouse',
  MILESTONE,
  IS_SAMPLE ? `${FORM_FACTOR}-sample` : FORM_FACTOR,
)
/**
 * Pages use the same HTTP/2 and brotli transport as the observed Cloudflare
 * edge. A short-lived loopback certificate is pinned only in the audit-owned
 * browser; no trust store changes. Sessions are created against the isolated
 * gate, then their synthetic cookies are scoped to the audit proxy through CDP.
 */
const CATALOGUE = JSON.parse(
  await readFile(new URL('../src/client/locales/en/common.json', import.meta.url), 'utf8'),
)

/**
 * Simulated throttling still starts from observed server timings, which
 * jitter on a workstation; the median of five runs per page is what
 * Lighthouse CI reports and what the budgets are judged on.
 */
const RUNS_PER_PAGE = IS_SAMPLE ? 1 : LIGHTHOUSE_RUNS_PER_PAGE
if (
  process.env.LIGHTHOUSE_RUNS !== undefined &&
  Number(process.env.LIGHTHOUSE_RUNS) !== RUNS_PER_PAGE
) {
  throw new Error(
    'M19 certification requires five runs. Use LIGHTHOUSE_SAMPLE=1 for a labelled diagnostic.',
  )
}

/** The run whose performance score is the median; ties go to the earlier run. */
function medianRun(runs) {
  const sorted = runs.toSorted((a, b) => a.scores.performance - b.scores.performance)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

async function auditMedian(origin, chrome, surface) {
  const runs = []
  for (let run = 0; run < RUNS_PER_PAGE; run += 1) {
    const sample = await audit(origin, chrome, surface)
    if (sample !== null) {
      runs.push(sample)
      console.info(`${FORM_FACTOR} ${surface.id}: trace ${run + 1}/${RUNS_PER_PAGE}`)
    }
  }
  const aggregate = summarizeRuns(runs, RUNS_PER_PAGE)
  const chosen = medianRun(runs)
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(path.join(REPORT_DIR, `${chosen.slug}.html`), chosen.report)
  await writeFile(
    path.join(REPORT_DIR, `${chosen.slug}.json`),
    JSON.stringify(
      {
        mode: IS_SAMPLE ? 'diagnostic' : 'certification',
        transport: TRANSPORT,
        runs: runs.map(({ scores, metrics, protocols }) => ({ scores, metrics, protocols })),
        ...aggregate,
      },
      null,
      2,
    ),
  )
  return aggregate
}

async function audit(origin, chrome, surface, attempt = 1) {
  const { pathname } = surface
  // Desktop preset: 40 ms RTT, 10 Mbps, no CPU slowdown. Mobile: Lighthouse's
  // default config, which emulates a phone screen, slow 4G and a 4x slower CPU.
  const result = await lighthouse(
    `${origin}${pathname}`,
    {
      port: chrome.port,
      output: 'html',
      logLevel: 'error',
      onlyCategories: Object.keys(BUDGETS),
      clearStorageTypes: [
        'file_systems',
        'shader_cache',
        'service_workers',
        'cache_storage',
        'local_storage',
        'indexeddb',
      ],
    },
    FORM_FACTOR === 'desktop' ? desktopConfig : undefined,
  )
  if (result === undefined) {
    throw new Error(`Lighthouse produced no result for ${surface.id}`)
  }
  if (result.lhr.runtimeError !== undefined) {
    // Trace capture occasionally fails (NO_NAVSTART); Lighthouse itself says
    // to rerun. A sample that never traces causes the required five-trace aggregate to fail.
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`Retrying trace capture for ${surface.id}`)
      return await audit(origin, chrome, surface, attempt + 1)
    }
    console.warn(`Trace capture failed for ${surface.id}`)
    return null
  }
  const protocols = validateAuditNavigation({
    origin,
    pathname,
    finalDisplayedUrl: result.lhr.finalDisplayedUrl,
    requests: result.lhr.audits['network-requests']?.details?.items,
  })
  const inspection = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`)
  try {
    const page = inspection
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url() === result.lhr.finalDisplayedUrl)
    if (page === undefined)
      throw new Error('Lighthouse audit page is no longer available for content verification')
    await assertAuditContent(page, surface, CATALOGUE)
  } catch {
    throw new Error(`Lighthouse did not render the required state for ${surface.id}`)
  } finally {
    await inspection.close()
  }
  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, category]) => [key, category.score ?? 0]),
  )
  const slug = surface.id
  const metrics = Object.fromEntries(
    Object.entries(LIGHTHOUSE_METRICS).map(([key, auditId]) => [
      key,
      result.lhr.audits[auditId]?.numericValue,
    ]),
  )
  return { scores, metrics, protocols, slug, report: result.report }
}

const requested = process.env.LIGHTHOUSE_PAGES?.split(',')
  .map((page) => page.trim())
  .filter(Boolean)
if (requested?.length === 0) throw new Error('Lighthouse page selection is empty.')
const publicRoute = (route) => route.replaceAll(/\$(\w+)/g, '<$1>')
const knownPages = new Set(AUDIT_SURFACES.flatMap(({ id, route }) => [id, publicRoute(route)]))
if (requested?.some((selection) => !knownPages.has(selection)) === true)
  throw new Error('Unknown Lighthouse page filter.')
const selected = AUDIT_SURFACES.filter(
  ({ id, route }) =>
    requested === undefined || requested.includes(id) || requested.includes(publicRoute(route)),
)
const PROXY_PORT = 0
const MAX_ATTEMPTS = 3
const TRANSPORT = 'HTTP/2 over TLS with an ephemeral key pinned only in the audit browser'
async function createAuditProfile() {
  const workspace = await realpath(process.cwd())
  const parent = path.join(workspace, 'temp', 'lumafoil-lighthouse')
  await mkdir(parent, { recursive: true })
  const actualParent = await realpath(parent)
  if (!actualParent.startsWith(workspace + path.sep))
    throw new Error('Audit profile parent escapes the workspace.')
  return { parent: actualParent, directory: await mkdtemp(path.join(actualParent, 'profile-')) }
}
async function removeAuditProfile(profile) {
  const actual = await realpath(profile.directory)
  if (path.dirname(actual) !== profile.parent || !path.basename(actual).startsWith('profile-'))
    throw new Error('Refusing to remove an unverified browser profile.')
  // Child process file handles can close shortly after Chrome exits on Windows.
  const cleanup = { maxRetries: 10, retryDelay: 100 }
  await rm(actual, { recursive: true, force: true, ...cleanup })
}
let chrome
let proxy
let profile
let certificate
let fixtures
try {
  fixtures = await prepareLighthouseSurfaces(BASE_URL, selected)
  certificate = await createAuditCertificate()
  proxy = await startCompressingProxy({ upstream: BASE_URL, port: PROXY_PORT, tls: certificate })
  profile = await createAuditProfile()
  chrome = await launchAuditChrome({
    userDataDir: profile.directory,
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu', certificate.browserFlag],
  })
  const rows = []
  async function runPage(surface) {
    const isAuthenticated = surface.cookie !== ''
    await fixtures.before(surface)
    await setAuditCookies(chrome.port, proxy.origin, surface.cookie)
    console.info(`Auditing ${FORM_FACTOR} ${surface.id}`)
    const result = await auditMedian(proxy.origin, chrome, surface)
    rows.push({
      pathname: surface.id,
      ...result,
      failures: budgetFailures(result, FORM_FACTOR, isAuthenticated),
    })
  }
  for (const surface of fixtures.surfaces) await runPage(surface)
  const summary = [
    `# M19 ${FORM_FACTOR} ${IS_SAMPLE ? 'diagnostic sample - not certification' : 'certification'}`,
    '',
    `Runs per page: ${RUNS_PER_PAGE}. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.`,
    '',
    `Transport: ${TRANSPORT}. Normal hosted TLS and deployment performance remain separate release evidence.`,
    '',
    '| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${row.pathname}\` | ${Math.round(row.scores.performance * 100)} | ${Math.round(row.scores.accessibility * 100)} | ${Math.round(row.scores['best-practices'] * 100)} | ${row.metrics.fcp.toFixed(0)} | ${row.metrics.lcp.toFixed(0)} | ${row.metrics.cls.toFixed(4)} | ${row.metrics.tbt.toFixed(0)} | ${row.failures.length === 0 ? 'Within budgets' : row.failures.join('; ')} |`,
    ),
  ]
  if (requested !== undefined)
    summary.splice(2, 0, 'Scope: selected pages only. Full milestone certification remains open.')
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(path.join(REPORT_DIR, 'summary.md'), summary.join('\n') + '\n')
  console.info(summary.join('\n'))
  if (rows.some((row) => row.failures.length > 0)) process.exitCode = 1
} finally {
  await fixtures?.dispose()
  await proxy?.close()
  try {
    await chrome?.kill()
    if (profile !== undefined) await removeAuditProfile(profile)
  } catch {
    console.warn('Lighthouse-owned browser cleanup failed.')
  } finally {
    await certificate?.dispose()
  }
}
