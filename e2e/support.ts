/**
 * Helpers shared by the end-to-end specs: mailbox polling for verification
 * and invitation links, sign-up, and the axe accessibility assertion.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { type APIRequestContext, expect, type Page } from '@playwright/test'

export interface Person {
  name: string
  email: string
  password: string
}

interface MailboxMessage {
  to: string
  subject: string
  text: string
}

export async function latestLinkFor(
  request: APIRequestContext,
  to: string,
  fragment: string,
): Promise<string> {
  await expect
    .poll(async () => {
      const response = await request.get('/api/dev/mailbox')
      const { messages } = (await response.json()) as { messages: MailboxMessage[] }
      const match = messages.find((message) => message.to === to && message.text.includes(fragment))
      return match?.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(fragment)) ?? null
    })
    .not.toBeNull()
  const response = await request.get('/api/dev/mailbox')
  const { messages } = (await response.json()) as { messages: MailboxMessage[] }
  const match = messages.find((message) => message.to === to && message.text.includes(fragment))
  const url = match?.text
    .match(/https?:\/\/\S+/g)
    ?.find((candidate) => candidate.includes(fragment))
  if (url === undefined) {
    throw new Error(`no link with ${fragment} for ${to}`)
  }
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

export async function signUpAndVerify(page: Page, request: APIRequestContext, person: Person) {
  await page.goto('/signup')
  // Route chunks load after the document; axe must see the rendered page.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account')
  await expectAccessible(page)
  await page.getByLabel('Name').fill(person.name)
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password').fill(person.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
  await expectAccessible(page)

  const verifyPath = await latestLinkFor(request, person.email, '/api/auth/verify-email')
  await page.goto(verifyPath)
}

export async function signIn(page: Page, person: Person, expectedHeading: string | RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password').fill(person.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(expectedHeading)
}

/** Sign up, verify, and create an organization; lands on the dashboard. */
export async function createWorkspace(
  page: Page,
  request: APIRequestContext,
  person: Person,
  organizationName: string,
) {
  await signUpAndVerify(page, request, person)
  await expect(page).toHaveURL(/\/app\/organizations\/new/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your first organization')
  await page.getByLabel('Name').fill(organizationName)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(organizationName)
}
