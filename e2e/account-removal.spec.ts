import type { BrowserContext } from '@playwright/test'

import { PREVIEW_ORIGIN } from './preview'
import { expect, expectAccessible, saveSampleImage, signUpAndVerify, test } from './support'
import arabic from '../src/client/locales/ar/common.json' with { type: 'json' }
import english from '../src/client/locales/en/common.json' with { type: 'json' }

async function expectShareStatus(visitor: BrowserContext, path: string, status: number) {
  const response = await visitor.request.get(new URL(path, PREVIEW_ORIGIN).href)
  expect(response.status()).toBe(status)
}

/** Real auth, personal upload and public sharing are removed through the built settings UI. */
test('confirms self removal and revokes personal sharing', async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.slow()
  const person = {
    name: 'Account Removal Fixture',
    email: `account-removal-${crypto.randomUUID()}@example.test`,
    password: 'named account removal fixture passphrase',
  }
  await signUpAndVerify(page, request, person)
  await page.goto('/app/editor')
  await saveSampleImage(page)
  await page.goto('/app/gallery')
  await page.getByRole('checkbox', { name: 'Select sample-photo-watermarked.png' }).check()
  await page.getByRole('button', { name: 'Share 1' }).click()
  const shareDialog = page.getByRole('dialog')
  await shareDialog.getByLabel('Title', { exact: true }).fill('Removal share fixture')
  await shareDialog.getByRole('radio', { name: '7 days' }).click()
  await shareDialog.getByRole('button', { name: 'Create link' }).click()
  const shareUrl = new URL(await shareDialog.getByLabel('Link', { exact: true }).inputValue())
  const shareApi = shareUrl.pathname.replace('/share/', '/api/share/')
  const visitor = await browser.newContext()
  try {
    await expectShareStatus(visitor, shareApi, 200)
    await page.goto('/app/account')
    const isArabic = testInfo.project.name.endsWith('-ar-dark')
    const copy = isArabic ? arabic : english
    if (isArabic) {
      await page.getByRole('button', { name: english.language.menuLabel, exact: true }).click()
      await page.getByRole('menuitem', { name: 'العربية', exact: true }).click()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.accountAuth.heading)
    const remove = page.getByRole('button', { name: copy.accountRemoval.action, exact: true })
    await remove.click()
    const dialog = page.getByRole('alertdialog')
    const email = dialog.getByLabel(copy.accountRemoval.confirmLabel)
    const confirm = dialog.getByRole('button', { name: copy.accountRemoval.confirm, exact: true })
    await expect(confirm).toBeDisabled()
    await email.fill('another-account@example.test')
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('button', { name: copy.admin.cancel, exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expectShareStatus(visitor, shareApi, 200)
    await remove.click()
    await expect(email).toHaveValue('')
    await email.fill(person.email)
    await expect(confirm).toBeEnabled()
    await expectAccessible(page)
    await dialog.screenshot({ path: testInfo.outputPath('account-removal-confirmation.png') })
    const response = page.waitForResponse(
      (value) =>
        value.url().endsWith('/api/auth/delete-user') && value.request().method() === 'POST',
    )
    await page.evaluate(`(() => {
      const descriptor = Object.getOwnPropertyDescriptor(IDBFactory.prototype, 'open')
      if (descriptor === undefined) throw new Error('IndexedDB fixture descriptor missing')
      const fixture = { descriptor, calls: 0 }
      globalThis.accountRemovalStorageFixture = fixture
      Object.defineProperty(IDBFactory.prototype, 'open', {
        configurable: true,
        value: () => {
          fixture.calls += 1
          throw new Error('Named account-removal device failure fixture')
        },
      })
    })()`)
    expect(await page.evaluate<number>('globalThis.accountRemovalStorageFixture.calls')).toBe(0)
    await confirm.click()
    const removed = await response
    expect(removed.status()).toBe(200)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    try {
      expect(
        await page.evaluate<number>('globalThis.accountRemovalStorageFixture?.calls ?? 0'),
      ).toBeGreaterThan(0)
      await expect(page.getByText(copy.accountRemoval.cleanupFailed, { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.auth.login.title)
      await expectAccessible(page)
      const cleanup = page.getByRole('complementary', {
        name: copy.accountRemoval.cleanupHeading,
      })
      await cleanup.screenshot({ path: testInfo.outputPath('device-cleanup-failure.png') })
    } finally {
      await page.evaluate(`(() => {
        const fixture = globalThis.accountRemovalStorageFixture
        if (fixture === undefined) throw new Error('IndexedDB fixture restoration missing')
        Object.defineProperty(IDBFactory.prototype, 'open', fixture.descriptor)
        delete globalThis.accountRemovalStorageFixture
      })()`)
    }
    await page.getByRole('button', { name: copy.accountRemoval.cleanupRetry, exact: true }).click()
    await expect(page.getByText(copy.accountRemoval.cleanupFailed, { exact: true })).toHaveCount(0)
    await expectShareStatus(visitor, shareApi, 404)
    const session = await page.request.get('/api/auth/get-session')
    expect(await session.json()).toBeNull()
    const signIn = await page.request.post('/api/auth/sign-in/email', {
      headers: { origin: PREVIEW_ORIGIN },
      data: { email: person.email, password: person.password },
    })
    expect(signIn.status()).toBe(401)
  } finally {
    await visitor.close()
  }
})
