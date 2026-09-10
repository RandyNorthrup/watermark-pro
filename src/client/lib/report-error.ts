/**
 * Best-effort reporting of uncaught errors and unhandled rejections to
 * `POST /api/client-errors`. Only a fixed error classification, own-asset code
 * coordinates and a known route shape leave the browser. Arbitrary messages,
 * rejection values and stack text can contain private data and are discarded.
 */
import type { ClientErrorReport } from '../../shared/api'
import { CLIENT_ERROR_MAX_SOURCE_LENGTH } from '../../shared/constants'
import {
  classifyClientError,
  redactRoutePath,
  sanitizeErrorSource,
} from '../../shared/observability'

const ENDPOINT = '/api/client-errors'

/** The first stack frame line, trimmed; the whole stack is never sent. */
export function topStackFrame(stack: string | undefined): string | null {
  if (stack === undefined) {
    return null
  }
  const frame = stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') || line.includes('@'))
  return frame ?? null
}

function ownAssetSource(source: string | null): string | undefined {
  if (source === null || source.length > CLIENT_ERROR_MAX_SOURCE_LENGTH) return undefined
  const location = /https?:\/\/[^\s)]+/.exec(source)?.[0]
  const coordinates = location?.match(/^(.*):(\d+):(\d+)$/)
  if (coordinates === null || coordinates === undefined) return undefined
  const [rawUrl, line, column] = coordinates.slice(1)
  if (rawUrl === undefined || line === undefined || column === undefined) return undefined
  try {
    const url = new URL(rawUrl)
    if (url.origin !== window.location.origin) return undefined
    return sanitizeErrorSource(`${url.pathname}:${line}:${column}`)
  } catch {
    return undefined
  }
}

/** Posts only a privacy-safe classification and code coordinates, never arbitrary error text. */
export function reportError(errorClass: string, source: string | null): void {
  const safeSource = ownAssetSource(source)
  const report: ClientErrorReport = {
    message: classifyClientError(errorClass),
    ...(safeSource !== undefined && { source: safeSource }),
    route: redactRoutePath(window.location.pathname),
  }
  const body = JSON.stringify(report)
  try {
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon(ENDPOINT, blob)) {
      return
    }
  } catch {
    // sendBeacon may be unavailable or reject the payload; fall back to fetch.
  }
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Reporting is best effort; swallow network failures.
  })
}

function onError(event: ErrorEvent): void {
  const source =
    event.filename === ''
      ? null
      : `${event.filename}:${String(event.lineno)}:${String(event.colno)}`
  reportError(event.error instanceof Error ? event.error.name : 'Error', source)
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason
  const errorClass = reason instanceof Error ? reason.name : 'UnhandledRejection'
  const source = reason instanceof Error ? topStackFrame(reason.stack) : null
  reportError(errorClass, source)
}

/** Installs the global error and unhandled-rejection listeners; returns a disposer. */
export function installErrorReporting(): () => void {
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
