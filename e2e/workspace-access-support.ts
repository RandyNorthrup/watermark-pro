import type { APIRequestContext, Page } from '@playwright/test'

import {
  expect,
  expectAccessible,
  gotoRetrying,
  latestLinkFor,
  navigateTo,
  prepareReturningUser,
  type Person,
} from './support'

/** Invite from the current-workspace modal through the real email delivery path. */
export async function inviteWorkspaceViewer(
  page: Page,
  request: APIRequestContext,
  person: Person,
): Promise<string> {
  await navigateTo(page, 'Members')
  const access = page.getByRole('dialog', { name: 'Manage Access' })
  await expect(access).toBeVisible()
  await access.getByLabel('Add People').fill(person.email)
  await access.getByRole('combobox', { name: 'Permission', exact: true }).click()
  await page.getByRole('option', { name: 'View', exact: true }).click()
  await expect(access.getByRole('switch', { name: 'Notify By Email' })).toBeChecked()
  await access.getByRole('button', { name: 'Send Invite' }).click()
  await expect(access.getByText('Workspace invitation sent.')).toBeVisible()
  await expectAccessible(page)
  return await latestLinkFor(request, person.email, '/workspace-invitation/')
}

/** The separate admission link creates an account without granting workspace membership. */
export async function signUpFromWorkspaceEmail(
  page: Page,
  request: APIRequestContext,
  person: Person,
): Promise<void> {
  await gotoRetrying(page, await latestLinkFor(request, person.email, '/signup?'))
  await page.getByLabel('Name', { exact: true }).fill(person.name)
  await page.getByLabel('Email', { exact: true }).fill(person.email)
  await page.getByLabel('Password', { exact: true }).fill(person.password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
  await expectAccessible(page)
  await gotoRetrying(page, await latestLinkFor(request, person.email, '/api/auth/verify-email'))
  await expect(page).toHaveURL(/\/app\/editor\/?$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Image')
  await prepareReturningUser(page)
}
