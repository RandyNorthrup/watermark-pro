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
  const sheetTrigger = page.getByRole('button', { name: 'Menu', exact: true })
  await expect
    .poll(async () => (await trigger.isVisible()) || (await sheetTrigger.isVisible()))
    .toBe(true)
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error('Navigation layout proof requires a fixed viewport')
  const columns = await page.evaluate<string>(
    `(() => {
      const toolbox = document.querySelector('[data-toolbox-scroll]');
      const grid = toolbox?.parentElement?.parentElement;
      if (!grid) throw new Error('Image toolbox grid must render');
      return getComputedStyle(grid).gridTemplateColumns;
    })()`,
  )
  if (columns.split(' ').length > 1) {
    const toolbox = await page.locator('[data-toolbox-scroll]').boundingBox()
    const canvas = await page.getByRole('region', { name: 'Canvas', exact: true }).boundingBox()
    if (toolbox === null || canvas === null) throw new Error('Image toolbox and canvas must render')
    expect(toolbox.x).toBeGreaterThanOrEqual(canvas.x + canvas.width)
  }
  await page.screenshot({ path: testInfo.outputPath('right-image-toolbox.png'), fullPage: false })
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
    await expect
      .poll(() =>
        page.evaluate<boolean>(
          `(() => {
            const items = Array.from(document.querySelectorAll('.gooey-panel .gooey-item'));
            return items.length > 0 && items.flatMap(item => item.getAnimations())
              .every(animation => animation.playState === 'finished' || animation.playState === 'idle');
          })()`,
        ),
      )
      .toBe(true)
    await expectAccessible(page)
    await testInfo.attach('gooey-menu-expanded', {
      body: await page.screenshot({
        path: testInfo.outputPath('gooey-menu-expanded.png'),
        fullPage: true,
      }),
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
    await sheetTrigger.click()
    const sheet = page.getByRole('dialog', { name: 'Menu', exact: true })
    await expect(sheet.getByRole('link', { name: 'Videos', exact: true })).toBeVisible()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  }
  await navigateTo(page, 'Videos')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Videos')
  await expectAccessible(page)
  const studioColumns = await page.evaluate<string>(
    `(() => {
      const workspace = document.querySelector('.studio-workspace');
      if (!workspace) throw new Error('Video workspace must render');
      return getComputedStyle(workspace).gridTemplateColumns;
    })()`,
  )
  if (studioColumns.split(' ').length > 1) {
    const toolbox = await page.locator('.studio-inspector').boundingBox()
    const viewer = await page.locator('.studio-viewer').boundingBox()
    if (toolbox === null || viewer === null) throw new Error('Video toolbox and viewer must render')
    expect(toolbox.x).toBeGreaterThanOrEqual(viewer.x + viewer.width)
  }
  await trigger.click()
  const videoNavigation = page.getByRole('navigation', { name: 'Primary', exact: true })
  await expect(videoNavigation.getByRole('link')).toHaveCount(6)
  await expect
    .poll(() =>
      page.evaluate<boolean>(
        `(() => {
          const links = Array.from(document.querySelectorAll('.gooey-panel .gooey-link'));
          const items = Array.from(document.querySelectorAll('.gooey-panel .gooey-item'));
          if (items.flatMap(item => item.getAnimations())
            .some(animation => animation.playState !== 'finished' && animation.playState !== 'idle')) return false;
          const bounds = links.map(link => link.getBoundingClientRect());
          const gaps = bounds.slice(1).map((rect, index) => rect.top - bounds[index].bottom);
          const hasRoundedArc = bounds.length === 6 &&
            bounds[2].left > bounds[0].left && bounds[3].left > bounds[5].left;
          return links.length === 6 && hasRoundedArc &&
            gaps.every(gap => gap > 0 && Math.abs(gap - gaps[0]) < 1) &&
            links.every(link => {
            const label = link.querySelector('.gooey-label');
            const icon = link.querySelector('.gooey-icon');
            if (!label || !icon || !label.textContent?.trim()) return false;
            const pill = link.getBoundingClientRect();
            const text = label.getBoundingClientRect();
            const symbol = icon.getBoundingClientRect();
            const style = getComputedStyle(link);
            const labelStyle = getComputedStyle(label);
            return pill.width > pill.height && text.width > 0 && text.height > 0 &&
              style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
              labelStyle.backgroundColor === 'rgba(0, 0, 0, 0)' &&
              labelStyle.color === style.color &&
              [text, symbol].every(bounds => bounds.left >= pill.left && bounds.right <= pill.right &&
                bounds.top >= pill.top && bounds.bottom <= pill.bottom);
          });
        })()`,
      ),
    )
    .toBe(true)
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('gooey-pills-expanded.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(videoNavigation).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('right-video-toolbox.png'), fullPage: false })
  await navigateTo(page, 'Documents')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documents')
  await expect(page.locator('[data-toolbox-scroll]')).toBeVisible()
  const documentColumns = await page.evaluate<string>(
    `(() => {
      const toolbox = document.querySelector('[data-toolbox-scroll]');
      const workspace = toolbox?.parentElement?.parentElement;
      if (!workspace) throw new Error('Document toolbox grid must render');
      return getComputedStyle(workspace).gridTemplateColumns;
    })()`,
  )
  if (documentColumns.split(' ').length > 1) {
    const toolbox = await page.locator('[data-toolbox-scroll]').boundingBox()
    const reader = await page
      .locator('[data-toolbox-scroll]')
      .locator('..')
      .locator('..')
      .locator(':scope > :first-child')
      .boundingBox()
    if (toolbox === null || reader === null)
      throw new Error('Document toolbox and reader must render')
    expect(toolbox.x).toBeGreaterThanOrEqual(reader.x + reader.width)
  }
  await expectAccessible(page)
  await page.screenshot({
    path: testInfo.outputPath('right-document-toolbox.png'),
    fullPage: false,
  })
})
