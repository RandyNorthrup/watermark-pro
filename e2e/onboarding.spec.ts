/**
 * Full onboarding journey against the production build in workerd:
 * sign up → verify by email → create an organization → invite a viewer →
 * the viewer signs up, accepts, and is denied management actions.
 *
 * Emails are read from the development mailbox endpoint that exists only
 * with the console email provider (never in production).
 */
import { expect, test } from '@playwright/test'

import { expectAccessible, latestLinkFor, signIn, signUpAndVerify } from './support'

const runId = Date.now().toString(36)
const owner = {
  name: 'Olivia Owner',
  email: `olivia-${runId}@example.test`,
  password: 'correct horse battery',
}
const viewer = {
  name: 'Vic Viewer',
  email: `vic-${runId}@example.test`,
  password: 'viewers long password',
}
const organizationName = `Acme ${runId}`

test.describe.configure({ mode: 'serial' })

test('owner signs up, verifies, and creates an organization', async ({ page, request }) => {
  await signUpAndVerify(page, request, owner)
  await expect(page).toHaveURL(/\/app\/organizations\/new/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your first organization')
  await expectAccessible(page)

  await page.getByLabel('Name').fill(organizationName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(organizationName)
  await expect(page.getByText('owner')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('link', { name: 'Audit log' }).first().click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('organization.created')).toBeVisible()
  await expectAccessible(page)
})

test('owner invites a viewer who accepts and is limited to reading', async ({
  browser,
  page,
  request,
}) => {
  await page.goto('/login')
  // Route chunks load after the document; axe must see the rendered page.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
  await expectAccessible(page)
  await signIn(page, owner, organizationName)

  await page.getByRole('link', { name: 'Members' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Members')
  await page.getByLabel('Email').fill(viewer.email)
  await page.getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: 'Viewer' }).click()
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText(`Invitation sent to ${viewer.email}.`)).toBeVisible()
  await expectAccessible(page)

  const acceptPath = await latestLinkFor(request, viewer.email, '/accept-invitation/')

  const viewerContext = await browser.newContext()
  const viewerPage = await viewerContext.newPage()
  await signUpAndVerify(viewerPage, request, viewer)
  await viewerPage.goto(acceptPath)
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText(`Join ${organizationName}`)
  await expectAccessible(viewerPage)
  await viewerPage.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText('Members')
  await expect(viewerPage.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
  await expect(viewerPage.getByText('(you)')).toBeVisible()

  const audit = await viewerContext.request.get('/api/orgs/placeholder/audit')
  expect(audit.status()).toBe(403)

  await viewerPage.getByRole('link', { name: 'Audit log' }).first().click()
  await expect(viewerPage.getByRole('alert')).toContainText(
    'Your role does not include audit access.',
  )
  await viewerContext.close()
})
