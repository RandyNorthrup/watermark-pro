import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('home page renders, reaches the API, and has no accessibility violations', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Watermark Pro/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('API ok')

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
