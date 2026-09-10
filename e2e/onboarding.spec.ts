/**
 * Full onboarding journey against the production build in workerd:
 * sign up → verify by email → private workspace → explicitly create a
 * collaboration organization → invite a viewer →
 * the viewer signs up, accepts, and is denied management actions.
 *
 * Emails are read from the development mailbox endpoint that exists only
 * with the console email provider (never in production).
 */

import {
  expect,
  expectAccessible,
  expectActiveWorkspace,
  gotoRetrying,
  latestLinkFor,
  navigateTo,
  signIn,
  signUpAndVerify,
  test,
} from './support'

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

test('owner starts in a private workspace and explicitly creates a collaboration', async ({
  page,
  request,
}) => {
  await signUpAndVerify(page, request, owner)
  await expect(page).toHaveURL(/\/app\/?$/)
  const personal = await expectActiveWorkspace(page, owner, 'My workspace')
  expect(personal.organization.members).toHaveLength(1)
  expect(personal.member.role).toBe('owner')
  await expectAccessible(page)

  await gotoRetrying(page, '/app/organizations/new')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New organization')
  await expectAccessible(page)
  await page.getByLabel('Name').fill(organizationName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(organizationName)
  const collaboration = await expectActiveWorkspace(page, owner, organizationName)
  expect(collaboration.organization.id).not.toBe(personal.organization.id)
  expect(collaboration.member.role).toBe('owner')
  await expect(page.getByText('Your workspace role: owner')).toBeVisible()
  await expectAccessible(page)

  await navigateTo(page, 'Audit log')
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

  await navigateTo(page, 'Members')
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
  const personal = await expectActiveWorkspace(viewerPage, viewer, 'My workspace')
  expect(personal.organization.members).toHaveLength(1)
  expect(personal.member.role).toBe('owner')
  // WebKit intermittently aborts the client-side load of this route; retry the
  // commit-wait navigation (see gotoRetrying).
  await gotoRetrying(viewerPage, acceptPath)
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText(`Join ${organizationName}`)
  await expectAccessible(viewerPage)
  await viewerPage.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText('Members')
  await expect(viewerPage.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
  await expect(viewerPage.getByText('(you)')).toBeVisible()
  const joined = await expectActiveWorkspace(viewerPage, viewer, organizationName)
  expect(joined.organization.id).not.toBe(personal.organization.id)
  expect(joined.member.role).toBe('viewer')
  expect(joined.organization.members.map((member) => member.user.email)).toEqual(
    expect.arrayContaining([owner.email, viewer.email]),
  )

  const audit = await viewerContext.request.get(`/api/orgs/${joined.organization.id}/audit`)
  expect(audit.status()).toBe(403)

  await navigateTo(viewerPage, 'Audit log')
  await expect(viewerPage.getByRole('alert')).toContainText(
    'Your role does not include audit access.',
  )
  await viewerContext.close()
})
