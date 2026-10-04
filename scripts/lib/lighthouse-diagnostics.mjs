/** Retain useful CI performance causes without persisting page text, selectors, or URLs. */
import { createHash } from 'node:crypto'

const EXECUTION_LIMITS = { coordinates: 20, tasks: 64 }
const TASK_GROUPS = new Set([
  'parseHTML',
  'scriptEvaluation',
  'scriptParseCompile',
  'styleLayout',
  'paintCompositeRender',
  'garbageCollection',
  'other',
])
const SOURCE_EVENTS = new Set(['FunctionCall', 'EvaluateScript', 'v8.compile'])

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
        ...(auditId === 'bootup-time' &&
          finite(item.scripting) !== null && { scripting: item.scripting }),
        ...(auditId === 'bootup-time' &&
          finite(item.scriptParseCompile) !== null && {
            scriptParseCompile: item.scriptParseCompile,
          }),
      },
    ]
  })
}

function executionDetails({ tasks, origin, assetSources }) {
  if (!Array.isArray(tasks))
    return {
      available: false,
      timingBasis: 'observed-main-thread',
      mapping: 'generated-build-only',
      timings: [],
      coordinates: [],
    }
  // Compile each build-listed source once; events only perform bounded coordinate lookups.
  const sources = new Map()
  if (assetSources instanceof Map) {
    for (const [pathname, text] of assetSources) {
      if (typeof text === 'string' && /^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(pathname))
        sources.set(pathname, {
          lines: text.split('\n'),
          digest: createHash('sha256').update(text).digest('hex'),
        })
    }
  }
  const usable = tasks.filter(
    (task) =>
      TASK_GROUPS.has(task?.group?.id) &&
      [task.startTime, task.duration, task.selfTime].every(
        (value) => finite(value) !== null && value >= 0,
      ) &&
      task.selfTime <= task.duration,
  )
  const ranked = usable.toSorted((a, b) => b.selfTime - a.selfTime)
  const timings = ranked
    .slice(0, EXECUTION_LIMITS.tasks)
    .toSorted((a, b) => a.startTime - b.startTime)
    .map((task) => ({
      group: task.group.id,
      startMs: task.startTime,
      inclusiveMs: task.duration,
      selfMs: task.selfTime,
    }))
  const coordinates = []
  let missingAttribution = 0
  let foreignAttribution = 0
  let coordinatesDiscarded = 0
  for (const task of ranked) {
    if (!SOURCE_EVENTS.has(task.event?.name)) continue
    const data = { ...task.event.args?.beginData, ...task.event.args?.data }
    const fromStack =
      typeof data.url !== 'string' && Array.isArray(data.stackTrace)
        ? data.stackTrace[0]
        : undefined
    const frame = fromStack ?? data
    let url
    try {
      url = new URL(frame.url)
    } catch {
      missingAttribution++
      continue
    }
    if (url.origin !== origin || url.username !== '' || url.password !== '') {
      foreignAttribution++
      continue
    }
    const match = /^\/assets\/([A-Za-z0-9_.-]+\.js)$/.exec(url.pathname)
    const source = match ? sources.get(url.pathname) : undefined
    // Installed trace-engine uses one-based direct sites; only FunctionCall stack frames normalize nonzero values.
    let line = frame.lineNumber
    let column = frame.columnNumber
    if (!fromStack || task.event.name === 'FunctionCall') {
      if (!fromStack || line !== 0) line -= 1
      if (!fromStack || column !== 0) column -= 1
    }
    if (
      !match ||
      source === undefined ||
      !Number.isSafeInteger(line) ||
      !Number.isSafeInteger(column) ||
      line < 0 ||
      column < 0 ||
      source.lines[line] === undefined ||
      column > source.lines[line].length
    ) {
      missingAttribution++
      continue
    }
    if (coordinates.length === EXECUTION_LIMITS.coordinates) {
      coordinatesDiscarded++
      continue
    }
    coordinates.push({
      asset: match[1],
      buildSha256: source.digest,
      line: line + 1,
      column: column + 1,
      context: fromStack ? 'synchronous-stack' : 'direct-event',
      startMs: task.startTime,
      inclusiveMs: task.duration,
      selfMs: task.selfTime,
    })
  }
  return {
    available: usable.length > 0,
    timingBasis: 'observed-main-thread',
    mapping: 'generated-build-only',
    missingAttribution,
    foreignAttribution,
    timingsTruncated: ranked.length > EXECUTION_LIMITS.tasks,
    coordinatesDiscarded,
    timings,
    coordinates,
  }
}

/** Safe, finite evidence for diagnosing runner-specific CLS and main-thread work. */
export function lighthouseDiagnostics(lhr, execution) {
  return {
    benchmarkIndex: finite(lhr?.environment?.benchmarkIndex),
    layoutShifts: layoutShifts(lhr),
    longTasks: timedItems(lhr, 'long-tasks'),
    bootup: timedItems(lhr, 'bootup-time'),
    ...(execution !== undefined && { execution: executionDetails(execution) }),
  }
}
