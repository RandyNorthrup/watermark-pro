/** Retain useful CI performance causes without persisting page text, selectors, or URLs. */

const DOM_PATH = /^\d+,[A-Z][A-Z0-9-]*(?:,\d+,[A-Z][A-Z0-9-]*)*$/
const LIGHTHOUSE_NODE_ID = /^page-\d+-[A-Z][A-Z0-9-]*$/

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rectangle(value) {
  if (typeof value !== 'object' || value === null) return null
  const source = value
  const fields = ['top', 'bottom', 'left', 'right', 'width', 'height']
  if (fields.some((field) => finite(source[field]) === null)) return null
  return Object.fromEntries(fields.map((field) => [field, Math.round(source[field])]))
}

function taskSource(url) {
  if (url === 'Unattributable') return 'unattributable'
  if (typeof url !== 'string') return 'unknown'
  try {
    const pathname = new URL(url).pathname
    const asset = /^\/assets\/([A-Za-z0-9_.-]+\.js)$/.exec(pathname)
    return asset?.[1] === undefined ? 'document' : `asset:${asset[1]}`
  } catch {
    return 'unknown'
  }
}

function layoutCause(item) {
  const subItems = item?.subItems?.items
  if (!Array.isArray(subItems)) return null
  if (subItems.some((entry) => entry?.cause === 'Web font loaded' || entry?.cause === 'Web font'))
    return 'web-font'
  return subItems.length > 0 ? 'other' : null
}

function layoutShifts(lhr) {
  const items = lhr?.audits?.['layout-shifts']?.details?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const score = finite(item?.score)
    if (score === null) return []
    const node = item?.node
    const path = typeof node?.path === 'string' && DOM_PATH.test(node.path) ? node.path : undefined
    const nodeId =
      typeof node?.lhId === 'string' && LIGHTHOUSE_NODE_ID.test(node.lhId) ? node.lhId : undefined
    const bounds = rectangle(node?.boundingRect)
    const cause = layoutCause(item)
    return [
      {
        score,
        ...(path !== undefined && { path }),
        ...(nodeId !== undefined && { nodeId }),
        ...(bounds !== null && { rectangle: bounds }),
        ...(cause !== null && { cause }),
      },
    ]
  })
}

function timedItems(lhr, auditId) {
  const items = lhr?.audits?.[auditId]?.details?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    const duration = finite(item?.duration ?? item?.total)
    if (duration === null) return []
    const startTime = finite(item?.startTime)
    return [
      {
        source: taskSource(item?.url),
        duration,
        ...(startTime !== null && { startTime }),
      },
    ]
  })
}

/** Safe, finite evidence for diagnosing runner-specific CLS and main-thread work. */
export function lighthouseDiagnostics(lhr) {
  return {
    benchmarkIndex: finite(lhr?.environment?.benchmarkIndex),
    layoutShifts: layoutShifts(lhr),
    longTasks: timedItems(lhr, 'long-tasks'),
    bootup: timedItems(lhr, 'bootup-time'),
  }
}
