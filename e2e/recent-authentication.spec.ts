/** Real credentials and real Worker responses; no forged successful auth or proof timestamps. */
import { PREVIEW_ORIGIN } from './preview'
import {
  expect,
  expectAccessible,
  gotoRetrying,
  latestLinkFor,
  navigateTo,
  prepareReturningUser,
  test,
} from './support'

test('verification-only session refuses sensitive work and fresh sign-in lets the user retry', async ({
  page,
  request,
}, testInfo) => {
  const person = {
    name: 'Recent Credential Fixture',
    email: `recent-credential-${crypto.randomUUID()}@example.test`,
    password: 'a recent credential fixture passphrase',
  }
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { origin: PREVIEW_ORIGIN },
    data: { ...person, callbackURL: '/app' },
  })
  expect(signup.status()).toBe(200)
  await gotoRetrying(page, await latestLinkFor(request, person.email, '/api/auth/verify-email'))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Images')
  await prepareReturningUser(page)
  await navigateTo(page, 'Invite people')
  const prompt = page.getByRole('dialog', { name: 'Sign in again', exact: true })
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('This sensitive change was not applied.')
  await expect(prompt).toContainText('Save or export unfinished edits first.')
  const invitations = await page.request.get('/api/me/invitations')
  expect(invitations.status()).toBe(200)
  expect(await invitations.json()).toEqual({ invitations: [] })
  await expectAccessible(page)
  await page.screenshot({
    path: testInfo.outputPath('recent-credential-prompt.png'),
  })
  await prompt.getByRole('link', { name: 'Sign in again', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByLabel('Email', { exact: true }).fill(person.email)
  await page.getByLabel('Password', { exact: true }).fill(person.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/invitations\/?$/)
  await expect(page.getByRole('dialog', { name: 'Sign in again', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Invitation link')).toHaveValue(/signup\?invitation=/)
  const beforeRetry = await page.request.get('/api/me/invitations')
  expect(await beforeRetry.json()).toEqual({ invitations: [] })
  await page.getByLabel('Email address').fill(`recipient-${crypto.randomUUID()}@example.test`)
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
  await expect(page.getByText('Invitation sent. It expires in seven days.')).toBeVisible()
  await expectAccessible(page)
})
