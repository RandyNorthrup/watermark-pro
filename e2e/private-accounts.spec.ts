import { z } from 'zod'

import { PREVIEW_ORIGIN } from './preview'
import {
  expect,
  expectAccessible,
  latestLinkFor,
  navigateTo,
  signUpAndVerify,
  test,
} from './support'
import { DEFAULT_TEXT_SPEC } from '../src/shared/watermark'

const workspaceSessionSchema = z.object({ session: z.object({ activeOrganizationId: z.string() }) })

test('site invitations create separate private workspaces and protect account totals', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID()
  const owner = {
    name: 'Private Owner',
    email: `private-owner-${suffix}@example.test`,
    password: 'a private owner passphrase',
  }
  const recipient = {
    name: 'Private Recipient',
    email: `private-recipient-${suffix}@example.test`,
    password: 'a private recipient passphrase',
  }
  await signUpAndVerify(page, request, owner)
  const session = await page.request.get('/api/auth/get-session')
  const ownerWorkspace = workspaceSessionSchema.parse(await session.json()).session
    .activeOrganizationId
  const preset = await page.request.post(`/api/orgs/${ownerWorkspace}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: { name: 'Owner-only preset canary', spec: DEFAULT_TEXT_SPEC },
  })
  expect(preset.status()).toBe(201)
  await navigateTo(page, 'Invite people')
  await expect(page.getByLabel('Invitation link')).toHaveValue(/signup\?invitation=/)
  const ownerReferral = await page.getByLabel('Invitation link').inputValue()
  await page.getByLabel('Email address').fill(recipient.email)
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
  await expect(page.getByText('Invitation sent. It expires in seven days.')).toBeVisible()
  await expectAccessible(page)
  const invitation = await latestLinkFor(request, recipient.email, '/signup?invitation=')
  await page.getByRole('button', { name: `Account menu for ${owner.name}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
  const signedOutSession = await page.request.get('/api/auth/get-session')
  expect(signedOutSession.status()).toBe(200)
  expect(await signedOutSession.json()).toBeNull()
  await page.goto(invitation)
  await page.getByLabel('Name', { exact: true }).fill(recipient.name)
  await page.getByLabel('Email', { exact: true }).fill(recipient.email)
  await page.getByLabel('Password', { exact: true }).fill(recipient.password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/check-email/)
  await page.goto(await latestLinkFor(request, recipient.email, '/api/auth/verify-email'))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  const recipientSession = await page.request.get('/api/auth/get-session')
  const recipientWorkspace = workspaceSessionSchema.parse(await recipientSession.json()).session
    .activeOrganizationId
  expect(recipientWorkspace).not.toBe(ownerWorkspace)
  const foreignLibrary = await page.request.get(`/api/orgs/${ownerWorkspace}/watermarks`)
  expect(foreignLibrary.status()).toBe(403)
  await navigateTo(page, 'Library')
  await expect(page.getByText('Owner-only preset canary')).toHaveCount(0)
  await navigateTo(page, 'Members')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your private workspace')
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
  await navigateTo(page, 'Invite people')
  await expect(page.getByText('You have not sent any invitations.')).toBeVisible()
  await expect(page.getByLabel('Invitation link')).not.toHaveValue(ownerReferral)
  const forbiddenStats = await page.request.get('/api/admin/account-stats')
  expect(forbiddenStats.status()).toBe(403)
  await page.goto('/app/admin')
  await expect(page.getByRole('alert')).toContainText('Only the site owner or an admin')
  await expect(page.getByText('Registered accounts', { exact: true })).toHaveCount(0)
  await expectAccessible(page)
})
