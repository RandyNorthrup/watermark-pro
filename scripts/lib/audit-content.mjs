import { auditLabel, requireSurface } from './audit-surfaces.mjs'

const CONTENT_READY_TIMEOUT_MS = 5000

async function becomesVisible(locator, timeout) {
  try {
    await locator.waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/** Fail closed when a successful HTTP page renders the wrong screen, an error, or the wrong seeded state. */
export async function assertAuditContent(
  page,
  surface,
  catalogue,
  { timeout = CONTENT_READY_TIMEOUT_MS } = {},
) {
  requireSurface(surface.id)
  const text = (key) => auditLabel(catalogue, key)
  const headingText =
    surface.headingText ??
    [surface.heading]
      .flat()
      .map((key) => text(key))
      .join(' ')
  const heading = page.getByRole('heading', { level: 1, name: headingText, exact: true })
  if (!(await becomesVisible(heading, timeout)))
    throw new Error('Audit page did not render its expected heading')
  function locate(check) {
    if (check.label !== undefined) return page.getByLabel(text(check.label), { exact: true })
    if (check.textKey !== undefined) return page.getByText(text(check.textKey), { exact: true })
    return page.getByRole(check.role, { name: text(check.nameKey), exact: true })
  }
  const checks = surface.checks ?? []
  for (const check of checks) {
    const control = locate(check)
    if (!(await becomesVisible(control, timeout)))
      throw new Error('Audit page did not render its required state')
    if (check.value !== undefined && (await control.inputValue()) !== check.value)
      throw new Error('Audit form did not load its fixture value')
    const content = await control.textContent()
    if (check.contains !== undefined && (content === null || !content.includes(check.contains)))
      throw new Error('Audit page did not load its fixture content')
    if (
      check.pressed !== undefined &&
      (await control.getAttribute('aria-pressed')) !== String(check.pressed)
    )
      throw new Error('Audit page did not select its expected view')
  }
  const decoded = await page.locator('img:visible').evaluateAll(async (images, timeout) => {
    const checks = images.map(async (image) => {
      const rect = image.getBoundingClientRect()
      if (
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= globalThis.innerWidth ||
        rect.top >= globalThis.innerHeight
      )
        return true
      try {
        await image.decode()
      } catch {
        return false
      }
      return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    })
    const allDecoded = async () => {
      const results = await Promise.all(checks)
      return results.every(Boolean)
    }
    return await Promise.race([
      allDecoded(),
      new Promise((resolve) => setTimeout(() => resolve(false), timeout)),
    ])
  }, timeout)
  if (!decoded) throw new Error('Audit page has an undecoded visible image')
}
