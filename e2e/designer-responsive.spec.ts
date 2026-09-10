import { expect, expectAccessible, navigateTo, signUpAndVerify, test } from './support'
import ar from '../src/client/locales/ar/common.json' with { type: 'json' }
import en from '../src/client/locales/en/common.json' with { type: 'json' }

const SUBPIXEL_TOLERANCE = 1

test('filled designer fits LTR and RTL viewports and retains keyboard radio selection', async ({
  page,
  request,
}, testInfo) => {
  await signUpAndVerify(page, request, {
    name: 'Responsive Designer',
    email: `designer-layout-${testInfo.project.name}-${String(Date.now())}@example.test`,
    password: 'responsive designer password',
  })
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: en.library.newPreset, exact: true }).click()
  await page
    .getByRole('textbox', { name: en.designer.text.label, exact: true })
    .fill('© Audit Studio')
  await page
    .getByLabel(en.designer.font.family, { exact: true })
    .selectOption('Playfair Display Variable')

  for (const catalogue of [en, ar]) {
    if (catalogue === ar) {
      await page.getByRole('button', { name: en.language.menuLabel, exact: true }).click()
      await page.getByRole('menuitem', { name: 'العربية', exact: true }).click()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(catalogue.library.newPreset)
    await expect(page.locator('html')).toHaveAttribute('dir', catalogue === ar ? 'rtl' : 'ltr')
    const preview = page.getByRole('img', { name: catalogue.designer.preview.alt, exact: true })
    await expect(preview).toBeVisible()
    await preview.evaluate(async (image: { decode: () => Promise<void> }) => {
      await image.decode()
    })
    await page.evaluate('document.fonts.ready')
    await expectAccessible(page)
    const viewport = page.viewportSize()
    if (viewport === null) throw new Error('Responsive designer proof requires a fixed viewport')
    const escapedControls = await page
      .locator('main form :is(input,select,textarea,button):visible')
      .evaluateAll(
        (
          controls: {
            tagName: string
            getBoundingClientRect: () => { left: number; right: number }
          }[],
          { width, tolerance },
        ) =>
          controls.flatMap((control) => {
            const bounds = control.getBoundingClientRect()
            return bounds.left < -tolerance || bounds.right > width + tolerance
              ? [control.tagName]
              : []
          }),
        { width: viewport.width, tolerance: SUBPIXEL_TOLERANCE },
      )
    expect(escapedControls, 'every visible designer control stays within the viewport').toEqual([])

    const effects = page.getByRole('radiogroup', {
      name: catalogue.designer.effects.textEffect,
      exact: true,
    })
    const solid = effects.getByRole('radio', {
      name: catalogue.designer.effects.solid,
      exact: true,
    })
    const outline = effects.getByRole('radio', {
      name: catalogue.designer.effects.outline,
      exact: true,
    })
    await solid.click()
    await solid.focus()
    // Radix moves focus in a task after keydown; keep the physical key down
    // until that move so an instantaneous synthetic keyup cannot race it.
    await page.keyboard.down('ArrowDown')
    try {
      await expect(outline).toBeFocused()
    } finally {
      await page.keyboard.up('ArrowDown')
    }
    await expect(outline).toHaveAttribute('aria-checked', 'true')
    await expect(solid).toHaveAttribute('aria-checked', 'false')
    await expect(effects.locator('input[type="radio"]:checked')).toHaveValue('outline')
    const backingInputs = await effects.locator('input[type="radio"]').all()
    for (const backingInput of backingInputs) {
      await expect(backingInput).toBeHidden()
    }
  }
})
