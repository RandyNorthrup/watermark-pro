import { PREVIEW_ORIGIN } from './preview'
import { expect, expectAccessible, prepareReturningUser, test } from './support'
import { createAuditAccount } from '../scripts/fixtures/audit-accounts.mjs'
import en from '../src/client/locales/en/common.json' with { type: 'json' }
import { cloudConnectionsSchema } from '../src/shared/cloud-connections'

test('account cloud status keeps layout stable without revealing pending identities or actions', async ({
  page,
}, testInfo) => {
  const account = await createAuditAccount(PREVIEW_ORIGIN, 'Account Layout')
  try {
    const state = await account.context.storageState()
    await page.context().addCookies(state.cookies)
  } finally {
    await account.context.dispose()
  }
  await prepareReturningUser(page)
  const held = Promise.withResolvers<undefined>()
  const received = Promise.withResolvers<undefined>()
  await page.route('**/api/me/cloud/connections', async (route) => {
    try {
      const upstream = await route.fetch()
      expect(upstream.status()).toBe(200)
      expect(cloudConnectionsSchema.parse(await upstream.json()).connections).toHaveLength(3)
      received.resolve(undefined)
      await held.promise
      await route.fulfill({ response: upstream })
    } catch (error) {
      received.reject(error)
      throw error
    }
  })
  try {
    await page.goto('/app/account')
    await received.promise
    const cloud = page
      .getByRole('heading', { name: en.cloudStorage.heading, exact: true })
      .locator('xpath=../..')
    const tour = page
      .getByRole('heading', { name: en.tour.settingsTitle, exact: true })
      .locator('xpath=..')
    await expect(cloud.getByRole('status')).toBeVisible()
    await expect(page.getByText(en.accountAuth.password, { exact: true })).toBeVisible()
    await expect(cloud.getByRole('button')).toHaveCount(0)
    await expect(cloud.getByRole('link')).toHaveCount(0)
    await expect(cloud.getByRole('list')).toHaveCount(0)
    await expectAccessible(page)
    const beforeCloud = await cloud.boundingBox()
    const beforeTour = await tour.boundingBox()
    expect(beforeCloud).not.toBeNull()
    expect(beforeTour).not.toBeNull()
    await page.screenshot({
      path: testInfo.outputPath('account-cloud-pending.png'),
      fullPage: true,
    })
    held.resolve(undefined)
    await expect(cloud.getByRole('listitem')).toHaveCount(3)
    await expect(cloud.getByRole('status')).toHaveCount(0)
    const afterCloud = await cloud.boundingBox()
    const afterTour = await tour.boundingBox()
    expect(afterCloud).not.toBeNull()
    expect(afterTour).not.toBeNull()
    if (beforeCloud === null || beforeTour === null || afterCloud === null || afterTour === null)
      throw new Error('Account cloud geometry was unavailable.')
    expect(afterCloud.height).toBe(beforeCloud.height)
    expect(afterTour.y).toBe(beforeTour.y)
    await expectAccessible(page)
    await page.screenshot({ path: testInfo.outputPath('account-cloud-ready.png'), fullPage: true })
  } finally {
    held.resolve(undefined)
    await page.unrouteAll({ behavior: 'wait' })
  }
})
