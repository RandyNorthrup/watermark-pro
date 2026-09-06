import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('landing page renders and has no accessibility violations', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Watermark Pro/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your workspace' })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('static responses carry the security headers from public/_headers', async ({ request }) => {
  const response = await request.get('/')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(response.headers()['x-frame-options']).toBe('DENY')
})

test('API responses are JSON with their own locked-down policy', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'ok' })
  expect(response.headers()['content-security-policy']).toContain("default-src 'none'")
})

test('protected pages redirect visitors to sign in', async ({ page }) => {
  await page.goto('/app/members')
  await expect(page).toHaveURL(/\/login\?redirect=%2Fapp%2Fmembers/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
})
