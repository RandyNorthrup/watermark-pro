import type { Locator, Page } from '@playwright/test'

import { expect, expectAccessible, navigateTo, pngFixture, signUpAndVerify, test } from './support'

interface FramePosition {
  left: string
  top: string
}

const LIVE_RENDER_TIMEOUT_MS = 5000

async function framePosition(frame: Locator): Promise<FramePosition> {
  return await frame.evaluate((element: { style: { left: string; top: string } }) => ({
    left: element.style.left,
    top: element.style.top,
  }))
}

async function expectFramePosition(frame: Locator, expected: FramePosition) {
  await expect.poll(async () => await framePosition(frame)).toEqual(expected)
}

/** Let React schedule the requested frame, then wait for its real bitmap and layout. */
async function expectCanvasReady(page: Page, image: Locator) {
  await page.evaluate(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  )
  await expect(page.getByRole('status', { name: 'Rendering preview' })).toHaveCount(0)
  await expect(image).toBeVisible()
  await expect
    .poll(
      async () =>
        await image.evaluate(
          (element: {
            complete: boolean
            naturalWidth: number
            naturalHeight: number
            getBoundingClientRect: () => { width: number; height: number }
          }) => {
            const rect = element.getBoundingClientRect()
            return element.complete &&
              element.naturalWidth > 0 &&
              element.naturalHeight > 0 &&
              rect.width > 0 &&
              rect.height > 0
              ? {
                  naturalWidth: element.naturalWidth,
                  naturalHeight: element.naturalHeight,
                  width: rect.width,
                  height: rect.height,
                }
              : null
          },
        ),
    )
    .not.toBeNull()
}

/** Native pointer traffic keeps flowing while the renderer must make progress. */
async function exerciseCanvas(page: Page, imageName: RegExp) {
  const image = page.getByRole('img', { name: imageName })
  await expectCanvasReady(page, image)
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
  // Pointer stays down while the slower WebKit main-thread renderer proves live progress.
  await expect
    .poll(async () => await image.getAttribute('src'), { timeout: LIVE_RENDER_TIMEOUT_MS })
    .not.toBe(source)
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
  // Intake reads metadata asynchronously; never capture undo geometry from the
  // previous sample while waiting for the selected portrait to replace it.
  await expect
    .poll(
      async () =>
        await page
          .getByRole('img', { name: /Photo with the watermark applied/ })
          .evaluate(
            (image: { naturalWidth: number; naturalHeight: number }) =>
              image.naturalWidth / image.naturalHeight,
          ),
    )
    .toBeCloseTo(900 / 1600, 3)
  await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Canvas live')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create watermark' })).toHaveCount(0)
  await exerciseCanvas(page, /Photo with the watermark applied/)
  const image = page.getByRole('img', { name: /Photo with the watermark applied/ })
  await page.getByRole('button', { name: '100%' }).click()
  const actualWidth = await image.evaluate(
    (element: { getBoundingClientRect: () => { width: number } }) =>
      element.getBoundingClientRect().width,
  )
  await page.getByRole('slider', { name: 'Zoom' }).fill('150')
  await expect
    .poll(
      async () =>
        await image.evaluate(
          (element: { getBoundingClientRect: () => { width: number } }) =>
            element.getBoundingClientRect().width,
        ),
    )
    .toBeGreaterThan(actualWidth)
  await page.getByRole('switch', { name: 'Grid' }).click()
  await page.getByRole('slider', { name: 'Grid spacing' }).fill('80')
  await expect(page.locator('[data-canvas-grid]')).toHaveCSS('--canvas-grid-spacing', '120px')
  await page.getByRole('button', { name: 'Fit' }).click()
  await expect
    .poll(async () => {
      const [canvas, fitted] = await Promise.all([
        page.getByRole('region', { name: 'Canvas' }).boundingBox(),
        image.boundingBox(),
      ])
      return {
        width: canvas !== null && fitted !== null && fitted.width <= canvas.width,
        height: canvas !== null && fitted !== null && fitted.height <= canvas.height,
      }
    })
    .toEqual({ width: true, height: true })
  const savedPreset = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/watermarks'),
  )
  await page.getByRole('button', { name: 'Save' }).click()
  const response = await savedPreset
  expect(response.status()).toBe(201)
  await page.getByRole('tab', { name: 'Presets' }).click()
  await expect(page.getByRole('list', { name: 'Layers, bottom to top' })).toContainText(
    'Canvas live',
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
  await page.getByRole('tab', { name: 'Shape', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Shape' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Ellipse' }).click()
  await expect(page.getByRole('radio', { name: 'Ellipse' })).toBeChecked()
  await page.keyboard.down('ArrowRight')
  try {
    await expect(page.getByRole('radio', { name: 'Line', exact: true })).toBeFocused()
  } finally {
    await page.keyboard.up('ArrowRight')
  }
  await expect(page.getByRole('radio', { name: 'Line', exact: true })).toBeChecked()
  await expect(page.getByRole('slider', { name: 'Length', exact: true })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('tab', { name: 'Text', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue(
    'Designer live',
  )
  await exerciseCanvas(page, /Watermark preview on the subject photo/)
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Watermark library', exact: true })
      .getByRole('link', { name: 'Designer signature', exact: true }),
  ).toBeVisible()
})
