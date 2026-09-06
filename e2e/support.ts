/**
 * Helpers shared by the end-to-end specs: mailbox polling for verification
 * and invitation links, sign-up, and the axe accessibility assertion.
 */
import { deflateSync } from 'node:zlib'

import { AxeBuilder } from '@axe-core/playwright'
import { type APIRequestContext, expect, type Page } from '@playwright/test'

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

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
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

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
