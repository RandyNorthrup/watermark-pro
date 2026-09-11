/** Real offline saves survive document reload and synchronize without duplicate uploads after a lost acknowledgement. */
import type { Locator, Page } from '@playwright/test'

import { test } from './offline-network'
import { createWorkspace, expect, expectAccessible, navigateTo } from './support'
import { photoListResponseSchema } from '../src/shared/api'
import { watermarkListResponseSchema } from '../src/shared/api-watermark'
import { shellOrganizationsSchema } from '../src/shared/shell-cache'

async function openOfflinePanel(page: Page): Promise<{
  panel: Locator
  close: () => Promise<void>
}> {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  const isPhoneMenu = await menu.isVisible()
  if (isPhoneMenu) await menu.click()
  const panel = page.getByRole('region', { name: 'Offline work', exact: true })
  await expect(panel).toBeVisible()
  return {
    panel,
    close: async () => {
      if (!isPhoneMenu) return
      await page.getByRole('button', { name: 'Close menu' }).click()
      await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
    },
  }
}

async function expectOfflineStatus(page: Page, text: string): Promise<void> {
  const view = await openOfflinePanel(page)
  await expect(view.panel.getByText(text, { exact: true })).toBeVisible()
  await view.close()
}

async function waitForOfflineReadiness(page: Page): Promise<void> {
  // Installation fetches the complete compiled inventory. Await its actual
  // lifecycle under the journey's existing timeout before checking UI readiness.
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  await expect
    .poll(
      async () =>
        await page.evaluate<boolean>(
          'navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js") ?? false',
        ),
    )
    .toBe(true)
  await expectOfflineStatus(page, 'App files are ready for offline use.')
}

test('keeps offline presets and photo saves across reload and reconnect', async ({
  page,
  request,
  offlineNetwork,
}) => {
  test.slow()
  const runId = crypto.randomUUID()
  const organizationName = `Offline ${runId.slice(0, 8)}`
  await createWorkspace(
    page,
    request,
    {
      name: 'Offline Owner',
      email: `offline-${runId}@example.test`,
      password: 'correct horse battery',
    },
    organizationName,
  )
  const organizationsResponse = await page.request.get('/api/auth/organization/list')
  const organizations = shellOrganizationsSchema.parse(await organizationsResponse.json())
  const createdOrganizations = organizations.filter(
    (organization) => organization.name === organizationName,
  )
  expect(createdOrganizations).toHaveLength(1)
  const organizationId = createdOrganizations[0]?.id
  if (organizationId === undefined) {
    throw new Error('Expected the created workspace')
  }
  const apiRoot = `/api/orgs/${organizationId}`

  await navigateTo(page, 'Gallery')
  await expect(page.getByText(/No photos yet/)).toBeVisible()
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('Offline watermark')
  await page.getByLabel('Preset name').fill('Offline base')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect
    .poll(async () => {
      const response = await page.request.get(`${apiRoot}/watermarks`)
      return watermarkListResponseSchema.parse(await response.json()).watermarks.length
    })
    .toBe(1)
  await page.getByRole('link', { name: 'Open Offline base in the editor' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  await waitForOfflineReadiness(page)
  await expect
    .poll(
      async () =>
        await page.evaluate<boolean>(
          'JSON.parse(localStorage.getItem("watermark-pro:query-cache") || "{}").role !== undefined',
        ),
    )
    .toBe(true)
  const storedShell = await page.evaluate<string | null>(
    'localStorage.getItem("watermark-pro:query-cache")',
  )
  expect(storedShell).not.toContain('"token"')

  await offlineNetwork.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor')
  const image = page.getByRole('img', { name: /Photo with the watermark/ })
  await expect
    .poll(
      async () => await image.evaluate((element: { naturalWidth: number }) => element.naturalWidth),
    )
    .toBeGreaterThan(0)
  await page.getByRole('tab', { name: 'Export' }).click()
  await page.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PNG' }).click()
  await page.getByRole('button', { name: 'Save to gallery' }).click()
  await expect(page.getByText(/Saved sample-photo-watermarked\.png to the/)).toBeVisible()
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('Made without a network')
  await page.getByLabel('Preset name').fill('Created offline')
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Created offline', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Created offline', exact: true })).toBeVisible()
  await expectAccessible(page)
  await navigateTo(page, 'Gallery')
  const photo = page.getByRole('button', { name: 'Open sample-photo-watermarked.png' })
  await expect(photo).toBeVisible()
  await expect
    .poll(
      async () =>
        await photo
          .locator('img')
          .evaluate((element: { naturalWidth: number }) => element.naturalWidth),
    )
    .toBeGreaterThan(0)

  const acknowledgement = await offlineNetwork.loseNextPhotoAcknowledgement(`${apiRoot}/photos`)
  await offlineNetwork.setOffline(false)
  await expect.poll(() => acknowledgement.didDrop).toBe(true)
  expect(acknowledgement.responseStatus).toBe(201)
  await acknowledgement.clear()
  const sync = await openOfflinePanel(page)
  await sync.panel.getByRole('button', { name: 'Sync now' }).click()
  await expect(sync.panel.getByText('Saved work is synchronized.', { exact: true })).toBeVisible()
  await sync.close()
  const savedPhotosResponse = await page.request.get(`${apiRoot}/photos`)
  const savedPhotos = photoListResponseSchema.parse(await savedPhotosResponse.json()).photos
  expect(savedPhotos).toHaveLength(1)
  const savedPresetsResponse = await page.request.get(`${apiRoot}/watermarks`)
  const savedPresets = watermarkListResponseSchema.parse(
    await savedPresetsResponse.json(),
  ).watermarks
  expect(
    savedPresets
      .map((preset) => preset.name)
      .toSorted((first, second) => first.localeCompare(second)),
  ).toEqual(['Created offline', 'Offline base'])
  await page.reload()
  await expect(photo).toBeVisible()
  await expectAccessible(page)
})

test('preserves both versions of a conflicting offline preset edit', async ({
  page,
  request,
  offlineNetwork,
}) => {
  test.slow()
  const runId = crypto.randomUUID()
  const organizationName = `Conflict ${runId.slice(0, 8)}`
  await createWorkspace(
    page,
    request,
    {
      name: 'Conflict Owner',
      email: `conflict-${runId}@example.test`,
      password: 'correct horse battery',
    },
    organizationName,
  )
  const response = await page.request.get('/api/auth/organization/list')
  const createdOrganizations = shellOrganizationsSchema
    .parse(await response.json())
    .filter((organization) => organization.name === organizationName)
  expect(createdOrganizations).toHaveLength(1)
  const organizationId = createdOrganizations[0]?.id
  if (organizationId === undefined) {
    throw new Error('Expected a workspace')
  }
  const path = `/api/orgs/${organizationId}/watermarks`
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByRole('textbox', { name: 'Text' }).fill('Original text')
  await page.getByLabel('Preset name').fill('Original preset')
  await page.getByRole('button', { name: 'Save preset' }).click()
  // Local-first saving can leave the previous synchronized label visible
  // briefly. The conflict needs a real server version, not that stale label.
  await expect
    .poll(async () => {
      const response = await page.request.get(path)
      return watermarkListResponseSchema.parse(await response.json()).watermarks.length
    })
    .toBe(1)
  await expectOfflineStatus(page, 'Saved work is synchronized.')
  const originalResponse = await page.request.get(path)
  const original = watermarkListResponseSchema.parse(await originalResponse.json()).watermarks[0]
  if (original === undefined) {
    throw new Error('Expected the saved preset')
  }
  await page.getByRole('link', { name: 'Original preset', exact: true }).click()
  await expect(page.getByLabel('Preset name')).toHaveValue('Original preset')
  await waitForOfflineReadiness(page)
  const observer = await offlineNetwork.createObserver()
  await offlineNetwork.setOffline(true)
  await page.getByLabel('Preset name').fill('Local version')
  const remote = await observer.put(`${path}/${original.id}`, {
    name: 'Remote version',
    spec: original.spec,
    expectedUpdatedAt: original.updatedAt,
  })
  expect(remote).toBe(200)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('link', { name: 'Local version', exact: true })).toBeVisible()
  await offlineNetwork.setOffline(false)
  const conflict = await openOfflinePanel(page)
  await conflict.panel.getByText('Review saved work (1)', { exact: true }).click()
  await expect(conflict.panel.getByText(/This preset changed elsewhere/)).toBeVisible()
  await expectAccessible(page)
  await conflict.panel.getByRole('button', { name: 'Keep both versions' }).click()
  await expect(
    conflict.panel.getByText('Saved work is synchronized.', { exact: true }),
  ).toBeVisible()
  await conflict.close()
  const savedResponse = await page.request.get(path)
  const saved = watermarkListResponseSchema.parse(await savedResponse.json()).watermarks
  expect(saved).toHaveLength(2)
  expect(saved.find((preset) => preset.id === original.id)?.name).toBe('Remote version')
  expect(saved.find((preset) => preset.name === 'Local version')?.id).not.toBe(original.id)
  await expect(page.getByRole('link', { name: 'Remote version', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Local version', exact: true })).toBeVisible()
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)')
  await offlineNetwork.setOffline(true)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Remote version', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Local version', exact: true })).toBeVisible()
})
