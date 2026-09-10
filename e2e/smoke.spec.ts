import { AxeBuilder } from '@axe-core/playwright'

import { expect, test } from './support'

test('landing page renders and has no accessibility violations', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Lumafoil/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your workspace' })).toHaveCount(0)

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

  const trigger = page.getByRole('button', { name: 'Change language', exact: true })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const chooser = page.getByRole('region', { name: 'Change language', exact: true })
  await expect(chooser.getByRole('menuitem', { name: 'English', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
  await expect(page.getByRole('main')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  const bounds = await chooser.getByRole('menu').boundingBox()
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(viewportWidth).toBeGreaterThan(0)
  expect(bounds).not.toBeNull()
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? viewportWidth) + (bounds?.width ?? viewportWidth)).toBeLessThanOrEqual(
    viewportWidth,
  )
  await page.keyboard.press('Escape')
  await expect(chooser).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
})
