import type { Locator, Page } from '@playwright/test'

import { expect, expectAccessible, navigateTo, pngFixture, signUpAndVerify, test } from './support'

interface FramePosition {
  left: string
  top: string
}

async function framePosition(frame: Locator): Promise<FramePosition> {
  return await frame.evaluate((element: { style: { left: string; top: string } }) => ({
    left: element.style.left,
    top: element.style.top,
  }))
}

async function expectFramePosition(frame: Locator, expected: FramePosition) {
  await expect.poll(async () => await framePosition(frame)).toEqual(expected)
}

/** Native pointer traffic keeps flowing while the renderer must make progress. */
async function exerciseCanvas(page: Page, imageName: RegExp) {
  const image = page.getByRole('img', { name: imageName })
  await expect(image).toBeVisible()
  await expect
    .poll(
      async () => await image.evaluate((element: { naturalWidth: number }) => element.naturalWidth),
    )
    .toBeGreaterThan(0)
  const dimensions = await image.evaluate(
    (element: {
      naturalWidth: number
      naturalHeight: number
      getBoundingClientRect: () => { width: number; height: number }
    }) => ({
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      displayed: element.getBoundingClientRect(),
    }),
  )
  expect(dimensions.displayed.width / dimensions.displayed.height).toBeCloseTo(
    dimensions.naturalWidth / dimensions.naturalHeight,
    2,
  )
  const frame = page.getByRole('group', { name: /Watermark position/ })
  await frame.scrollIntoViewIfNeeded()
  const initial = await framePosition(frame)
  const box = await frame.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) throw new Error('Watermark frame has no rendered bounds')
  const source = await image.getAttribute('src')
  await page.keyboard.down('Alt')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 40 })
  // Before pointerup: live bitmap and frame have both changed during continuous motion.
  expect(await image.getAttribute('src')).not.toBe(source)
  const moved = await framePosition(frame)
  expect(moved).not.toEqual(initial)
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await frame.focus()
  await page.keyboard.press('Control+z')
  await expectFramePosition(frame, initial)
  await page.keyboard.press('Control+Shift+z')
  await expectFramePosition(frame, moved)
  const rotation = await frame.evaluate(
    (element: { style: { left: string; top: string; transform: string } }) =>
      element.style.transform,
  )
  await page.keyboard.press(']')
  await expect
    .poll(
      async () =>
        await frame.evaluate(
          (element: { style: { left: string; top: string; transform: string } }) =>
            element.style.transform,
        ),
    )
    .not.toBe(rotation)
  await expectAccessible(page)
}

test('inline editor creates on its one live canvas and saves the exact edited draft', async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID()
  await signUpAndVerify(page, request, {
    name: 'Canvas owner',
    email: `canvas-${id}@example.test`,
    password: 'correct horse battery',
  })
  await navigateTo(page, 'Editor')
  await page.getByLabel('Open a photo').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: pngFixture(900, 1600, [48, 93, 104]),
  })
  await page.getByLabel('Preset name').fill('Live signature')
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Canvas live')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create watermark' })).toHaveCount(0)
  await exerciseCanvas(page, /Photo with the watermark applied/)
  await page.getByRole('button', { name: 'Save and use' }).click()
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(
    'Live signature',
  )
  await expect(page.getByRole('img', { name: /Photo with the watermark applied/ })).toHaveCount(1)
})

test('preset designer moves smoothly and keeps one gesture per undo step', async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID()
  await signUpAndVerify(page, request, {
    name: 'Designer owner',
    email: `designer-${id}@example.test`,
    password: 'correct horse battery',
  })
  await navigateTo(page, 'Library')
  await page.getByRole('link', { name: 'New preset' }).click()
  await page.getByLabel('Preset name').fill('Designer signature')
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Designer live')
  await exerciseCanvas(page, /Watermark preview on the subject photo/)
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByRole('link', { name: 'Designer signature', exact: true })).toBeVisible()
})
