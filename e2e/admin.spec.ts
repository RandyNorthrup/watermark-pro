/**
 * Platform administration journey against the production build in workerd:
 * an ordinary owner cannot reach the console, the single test administrator can
 * search users, ban one (whose session ends and whose sign-in is refused),
 * unban them, see every organization, and find the ban in the global audit
 * trail. Every device signs into the same administrator in isolated gate state.
 */

import { PREVIEW_ORIGIN } from './preview'
import {
  createWorkspace,
  expect,
  expectAccessible,
  expectNoNavLink,
  navigateTo,
  signIn,
  test,
} from './support'
import { ensureTestSiteOwner, TEST_SITE_OWNER } from '../scripts/lib/test-site-owner'

const runId = Date.now().toString(36)
const admin = {
  name: 'Ada Admin',
  email: `ada-${runId}@example.test`,
  password: 'correct horse battery',
}
const member = {
  name: 'Mo Member',
  email: `mo-${runId}@example.test`,
  password: 'correct horse battery',
}
const adminOrganization = `Admin Org ${runId}`
const memberOrganization = `Member Org ${runId}`

test('the sole administrator manages users and sees account totals', async ({
  browser,
  page,
  request,
}) => {
  // Two full sign-ups, a wrangler subprocess and five axe scans: three times the default budget.
  test.slow()
  await createWorkspace(page, request, admin, adminOrganization)

  // Before promotion the console is a dead end and the nav does not offer it.
  await expectNoNavLink(page, 'Admin')
  await page.goto('/app/admin')
  await expect(page.getByRole('alert')).toContainText('Only the site administrator')
  await expectAccessible(page)

  // A second, unrelated account with its own organization and live session.
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await createWorkspace(memberPage, memberContext.request, member, memberOrganization)

  await ensureTestSiteOwner(PREVIEW_ORIGIN)
  await page.request.post('/api/auth/sign-out', { data: {}, headers: { origin: PREVIEW_ORIGIN } })
  await signIn(page, TEST_SITE_OWNER, 'My workspace')
  await navigateTo(page, 'Admin')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administration')
  await expect(page.getByText(/\d+ users?[,.]/)).toBeVisible()
  await expect(page.getByText('Registered accounts', { exact: true })).toBeVisible()
  await expect(page.getByText('Verified accounts', { exact: true })).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel('Search by email').fill(member.email)
  await expect(page.getByText('1 user.')).toBeVisible()
  await expect(page.getByText(member.name)).toBeVisible()

  await page.getByRole('button', { name: `Ban ${member.email}` }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel('Reason').fill('policy violation')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Ban user' }).click()
  await expect(page.getByText('banned: policy violation')).toBeVisible()

  // The banned member's session is gone and signing in again is refused.
  await memberPage.goto('/app')
  await expect(memberPage).toHaveURL(/\/login/)
  await memberPage.getByLabel('Email').fill(member.email)
  await memberPage.getByLabel('Password').fill(member.password)
  await memberPage.getByRole('button', { name: 'Sign in' }).click()
  await expect(memberPage.getByRole('alert')).toBeVisible()
  await expect(memberPage).toHaveURL(/\/login/)

  await page.getByRole('button', { name: `Unban ${member.email}` }).click()
  await expect(page.getByText('banned: policy violation')).toHaveCount(0)
  await signIn(memberPage, member, memberOrganization)
  await memberContext.close()

  await page.getByRole('tab', { name: 'Organizations' }).click()
  const organizations = page.getByRole('table', { name: /Organizations/ })
  await expect(organizations).toContainText(adminOrganization)
  await expect(organizations).toContainText(memberOrganization)
  await expectAccessible(page)

  await page.getByRole('tab', { name: 'Audit trail' }).click()
  const audit = page.getByRole('table', { name: /Audit entries/ })
  await expect(audit.getByText('admin.user_banned').first()).toBeVisible()
  await expect(audit.getByText('admin.user_unbanned').first()).toBeVisible()
  await expectAccessible(page)

  // The admin routes themselves refuse a signed-out caller.
  const guest = await browser.newContext()
  const anonymous = await guest.request.get('/api/admin/organizations')
  expect(anonymous.status()).toBe(401)
  await guest.close()
})
