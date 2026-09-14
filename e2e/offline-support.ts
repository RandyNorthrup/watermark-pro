import type { Locator, Page } from '@playwright/test'

import { expect } from './support'

const OFFLINE_READY_TIMEOUT_MS = 120_000

/** Opens the status region through the actual desktop or phone navigation. */
export async function openOfflinePanel(page: Page): Promise<{
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

/** Checks the visible readiness or synchronization message without leaving the menu open. */
export async function expectOfflineStatus(
  page: Page,
  text: string,
  timeout?: number,
): Promise<void> {
  const view = await openOfflinePanel(page)
  const status = view.panel.getByText(text, { exact: true })
  if (timeout === undefined) await expect(status).toBeVisible()
  else await expect(status).toBeVisible({ timeout })
  await view.close()
}

/** Requires the matching app worker and complete static inventory before disconnecting. */
export async function waitForOfflineReadiness(page: Page): Promise<void> {
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
  const view = await openOfflinePanel(page)
  const status = view.panel.getByRole('status')
  await expect(status).toHaveAttribute('title', /App files are ready for offline use\.$/, {
    timeout: OFFLINE_READY_TIMEOUT_MS,
  })
  await expect(status).toHaveCSS('white-space', 'nowrap')
  await view.close()
}
