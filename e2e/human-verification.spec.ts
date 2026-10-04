/** Browser challenge lifecycle; provider security is proven separately with real server harnesses. */
import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

import { expect, expectAccessible, test } from './support'
import { publicConfigSchema } from '../src/shared/api'

/** Named provider fixture uses documented dimensions; it never claims live human verification. */
async function installWidgetFixture(page: Page) {
  const content = await readFile(new URL('fixtures/human-widget.mjs', import.meta.url), 'utf8')
  await page.addInitScript({ content })
  await page.route('**/api/config', async (route) => {
    const actual = await route.fetch()
    const config = publicConfigSchema.parse(await actual.json())
    await route.fulfill({ json: { ...config, turnstileSiteKey: 'named-browser-fixture-key' } })
  })
}

test('requires a fresh challenge after expiration and refused password sign-in without overflowing the card', async ({
  page,
}, testInfo) => {
  await installWidgetFixture(page)
  const submissions: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/sign-in/email')
      submissions.push(request.headers()['x-captcha-response'] ?? '')
  })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(`human-${crypto.randomUUID()}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('unknown account fixture passphrase')
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(submit).toBeDisabled()
  await page.getByRole('button', { name: 'Solve verification fixture' }).click()
  await expect(submit).toBeEnabled()
  await page.getByRole('button', { name: 'Expire verification fixture' }).click()
  await expect(submit).toBeDisabled()
  expect(submissions).toEqual([])
  const widget = page.getByLabel('Named human verification fixture')
  const container = page.getByLabel('Human verification', { exact: true })
  const bounds = await widget.boundingBox()
  const available = await container.boundingBox()
  if (bounds === null || available === null) throw new Error('Human widget must have real bounds')
  expect(bounds.width).toBeLessThanOrEqual(available.width)
  expect(bounds.height).toBeLessThanOrEqual(available.height)
  expect(await page.evaluate('document.documentElement.scrollWidth > innerWidth')).toBe(false)
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('human-login-fixture.png'), fullPage: true })
  await page.getByRole('button', { name: 'Solve verification fixture' }).click()
  await submit.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(submit).toBeDisabled()
  expect(submissions).toHaveLength(1)
  expect(submissions[0]).toContain('fixture-account_admission-')
  await page.getByRole('button', { name: 'Solve verification fixture' }).click()
  await expect(submit).toBeEnabled()
  expect(submissions).toHaveLength(1)
})

test('refuses credential submission when public configuration cannot load', async ({ page }) => {
  let isSubmitted = false
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/sign-in/email') isSubmitted = true
  })
  await page.route('**/api/config', (route) => route.abort('failed'))
  await page.goto('/login')
  await expect(page.getByRole('alert')).toContainText('Human verification is unavailable')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled()
  expect(isSubmitted).toBe(false)
  await expectAccessible(page)
})
