import { expect, expectAccessible, navigateTo, signUpAndVerify, test } from './support'

/** The wide rail must stay collapsed between destinations; phones retain their native-sized sheet. */
test('expands the navigation bullet, restores focus and closes after routing', async ({
  page,
  request,
}, testInfo) => {
  await signUpAndVerify(page, request, {
    name: 'Navigation Owner',
    email: `navigation-${crypto.randomUUID()}@example.test`,
    password: 'synthetic navigation passphrase',
  })
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
  if (await trigger.isVisible()) {
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toHaveCount(0)
    const bounds = await page.locator('[data-workspace-navigation]').boundingBox()
    const canvas = await page.getByRole('region', { name: 'Canvas', exact: true }).boundingBox()
    if (bounds === null || canvas === null)
      throw new Error('Expected visible navigation and canvas bounds')
    expect(bounds.x).toBe(0)
    expect(bounds.width).toBe(24)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas.x)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const navigation = page.getByRole('navigation', { name: 'Primary', exact: true })
    await expect(navigation.getByRole('link')).toHaveCount(6)
    await expect(navigation.getByRole('link', { name: 'Videos', exact: true })).toBeVisible()
    await expect(navigation.locator('.gooey-item').first()).toHaveCSS(
      'animation-name',
      'gooey-spread',
    )
    await expectAccessible(page)
    await testInfo.attach('gooey-menu-expanded', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(navigation).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await trigger.click()
    await expect(navigation.locator('.gooey-item').first()).toHaveCSS('animation-name', 'none')
    await navigation.getByRole('link', { name: 'Saved Watermarks', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/library$/)
    await expect(trigger).toBeVisible()
    await expect(navigation).toHaveCount(0)
    await trigger.click()
    await page.getByRole('heading', { level: 1 }).click()
    await expect(navigation).toHaveCount(0)
  } else {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Menu', exact: true })
    await expect(sheet.getByRole('link', { name: 'Videos', exact: true })).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  }
  await navigateTo(page, 'Videos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Videos')
  await expectAccessible(page)
})
