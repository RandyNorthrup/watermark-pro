/**
 * Helpers shared by the end-to-end specs: mailbox polling for verification
 * and invitation links, sign-up, and the axe accessibility assertion.
 */
import { deflateSync } from 'node:zlib'

import { AxeBuilder } from '@axe-core/playwright'
import {
  type APIRequestContext,
  type Download,
  expect,
  type Page,
  test as base,
  type TestInfo,
} from '@playwright/test'

import { PREVIEW_ORIGIN } from './preview'

export { expect } from '@playwright/test'

/** Octets of the documentation range each test's address is drawn from. */
const ADDRESS_PREFIX = '203.0.113'
const OCTET_RANGE = 256

/** A stable, distinct client address per test, from a hash of its id. */
function addressFor(testInfo: TestInfo): string {
  let hash = 0
  for (const char of testInfo.testId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }
  const octet = (hash + testInfo.repeatEachIndex) % OCTET_RANGE
  return `${ADDRESS_PREFIX}.${String(octet)}`
}

/**
 * Every journey gets its own client address, as it would with real users on
 * real devices. The Worker rate-limits credential attempts per address
 * (PLAN.md 5.4); four device projects signing up in parallel from one
 * address would trip that limit, and the limiter itself is proven by
 * `auth-flow.workers.test.ts` against the real binding.
 */
export const test = base.extend({
  context: async ({ context }, provide, testInfo) => {
    await context.setExtraHTTPHeaders({ 'cf-connecting-ip': addressFor(testInfo) })
    await provide(context)
  },
})

export interface Person {
  name: string
  email: string
  password: string
}

interface MailboxMessage {
  to: string
  subject: string
  text: string
}

export async function latestLinkFor(
  request: APIRequestContext,
  to: string,
  fragment: string,
): Promise<string> {
  await expect
    .poll(async () => {
      const response = await request.get('/api/dev/mailbox')
      const { messages } = (await response.json()) as { messages: MailboxMessage[] }
      const match = messages.find((message) => message.to === to && message.text.includes(fragment))
      return match?.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(fragment)) ?? null
    })
    .not.toBeNull()
  const response = await request.get('/api/dev/mailbox')
  const { messages } = (await response.json()) as { messages: MailboxMessage[] }
  const match = messages.find((message) => message.to === to && message.text.includes(fragment))
  const url = match?.text
    .match(/https?:\/\/\S+/g)
    ?.find((candidate) => candidate.includes(fragment))
  if (url === undefined) {
    throw new Error(`no link with ${fragment} for ${to}`)
  }
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

const SIDEBAR_SELECTOR = 'nav[aria-label="Primary"]'

/**
 * Follows a primary navigation link. Wide layouts show every destination in
 * the sidebar; phones show the four tools in the tab bar and the rest behind
 * the "Menu" sheet, so the helper opens that when it has to.
 */
export async function navigateTo(page: Page, label: string) {
  const sidebar = page.getByRole('navigation', { name: 'Primary', exact: true })
  const tabBar = page.getByRole('navigation', { name: 'Tools' })
  // Both navigations are always in the document; CSS decides which one shows.
  // Waiting for the sidebar to exist means the shell has rendered (a CSS
  // locator, because role locators skip elements hidden by `display: none`).
  await page.locator(SIDEBAR_SELECTOR).waitFor({ state: 'attached' })
  for (const container of [sidebar, tabBar]) {
    const link = container.getByRole('link', { name: label, exact: true })
    if (await link.isVisible()) {
      await link.click()
      return
    }
  }
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Primary (menu)' })
    .getByRole('link', { name: label, exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
}

/** Asserts a destination is absent from the navigation, opening the phone menu when needed. */
export async function expectNoNavLink(page: Page, label: string) {
  await page.locator(SIDEBAR_SELECTOR).waitFor({ state: 'attached' })
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible()) {
    await menu.click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0)
  if (await menu.isVisible()) {
    await page.getByRole('button', { name: 'Close menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
  }
}

/**
 * Grants the platform admin role through the console-provider-only dev
 * route, the same change the runbook makes with a D1 update in production.
 */
export async function promoteToPlatformAdmin(request: APIRequestContext, email: string) {
  const response = await request.post('/api/dev/promote', {
    data: { email },
    headers: { origin: PREVIEW_ORIGIN },
  })
  expect(response.status()).toBe(200)
}

/**
 * axe with zero violations, and no sideways scrolling (WCAG 1.4.10 reflow):
 * a page wider than its viewport puts tap targets off-screen on a phone,
 * which is how a long nowrap preset description broke the Android tab bar.
 */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  )
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0)
}

export async function signUpAndVerify(page: Page, request: APIRequestContext, person: Person) {
  await page.goto('/signup')
  // Route chunks load after the document; axe must see the rendered page.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account')
  await expectAccessible(page)
  await page.getByLabel('Name').fill(person.name)
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password').fill(person.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
  await expectAccessible(page)

  const verifyPath = await latestLinkFor(request, person.email, '/api/auth/verify-email')
  await page.goto(verifyPath)
  // The verification link lands in the app, which redirects a member of no
  // organization to the creation page; wait for that before navigating on.
  await expect(page).toHaveURL(/\/app\/organizations\/new/)
}

export async function signIn(page: Page, person: Person, expectedHeading: string | RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password').fill(person.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(expectedHeading)
}

/** Sign up, verify, and create an organization; lands on the dashboard. */
export async function createWorkspace(
  page: Page,
  request: APIRequestContext,
  person: Person,
  organizationName: string,
) {
  await signUpAndVerify(page, request, person)
  await expect(page).toHaveURL(/\/app\/organizations\/new/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your first organization')
  await page.getByLabel('Name').fill(organizationName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(organizationName)
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

/**
 * A flat-colour 8-bit RGB PNG assembled in Node, so specs can upload real
 * image bytes that both the Worker's signature sniffing and the browser's
 * decoder accept.
 */
export function pngFixture(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // bit depth 8, colour type 2 (RGB), no interlace
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => rgb).flat()),
  ])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

/** Collects a Playwright download into memory. */
export async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream()
  const chunks: Uint8Array[] = []
  for await (const piece of stream) {
    chunks.push(new Uint8Array(piece as Uint8Array))
  }
  return Buffer.concat(chunks)
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
