/**
 * Full onboarding journey against the production build in workerd:
 * sign up → verify by email → private workspace → explicitly create a
 * collaboration workspace → invite a viewer →
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
  navigateTo,
  signIn,
  signUpAndVerify,
  test,
} from './support'
import { inviteWorkspaceViewer, signUpFromWorkspaceEmail } from './workspace-access-support'

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
  await expect(page).toHaveURL(/\/app\/editor\/?$/)
  const personal = await expectActiveWorkspace(page, owner, 'My workspace')
  expect(personal.organization.members).toHaveLength(1)
  expect(personal.member.role).toBe('owner')
  await expectAccessible(page)

  await gotoRetrying(page, '/app/organizations/new')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New workspace')
  await expectAccessible(page)
  await page.getByLabel('Name').fill(organizationName)
  await page.getByRole('button', { name: 'Create workspace' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Image')
  const collaboration = await expectActiveWorkspace(page, owner, organizationName)
  expect(collaboration.organization.id).not.toBe(personal.organization.id)
  expect(collaboration.member.role).toBe('owner')
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
  // Two accounts complete email admission, workspace joining, role checks and accessibility scans.
  test.slow()
  await page.goto('/login')
  // Route chunks load after the document; axe must see the rendered page.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
  await expectAccessible(page)
  await signIn(page, owner, organizationName)

  const acceptPath = await inviteWorkspaceViewer(page, request, viewer)

  const viewerContext = await browser.newContext()
  const viewerPage = await viewerContext.newPage()
  await signUpFromWorkspaceEmail(viewerPage, request, viewer)
  const personal = await expectActiveWorkspace(viewerPage, viewer, 'My workspace')
  expect(personal.organization.members).toHaveLength(1)
  expect(personal.member.role).toBe('owner')
  // WebKit intermittently aborts the client-side load of this route; retry the
  // commit-wait navigation (see gotoRetrying).
  await gotoRetrying(viewerPage, acceptPath)
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText(`Join ${organizationName}`)
  await expectAccessible(viewerPage)
  await viewerPage.getByRole('button', { name: 'Join Workspace' }).click()
  await expect(viewerPage.getByRole('heading', { level: 1 })).toHaveText('Image')
  await navigateTo(viewerPage, 'Members')
  const access = viewerPage.getByRole('dialog', { name: 'Manage Access' })
  await expect(access.getByRole('heading', { name: 'People With Access' })).toBeVisible()
  await expect(access.getByRole('button', { name: 'Send Invite' })).toHaveCount(0)
  await expect(access.getByText('(you)')).toBeVisible()
  await access.getByRole('button', { name: 'Close', exact: true }).click()
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
