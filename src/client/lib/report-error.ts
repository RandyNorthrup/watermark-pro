/**
 * Best-effort reporting of uncaught errors and unhandled rejections to
 * `POST /api/client-errors` (M19 observability). Bounded and low-PII: the
 * message, the single top stack frame and the current route only. Never throws
 * and never blocks — a failure to report must not itself break the page.
 */
import type { ClientErrorReport } from '../../shared/api'
import {
  CLIENT_ERROR_MAX_MESSAGE_LENGTH,
  CLIENT_ERROR_MAX_SOURCE_LENGTH,
} from '../../shared/constants'

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

/** Posts one report, preferring `sendBeacon` so it survives a navigation or crash. */
export function reportError(message: string, source: string | null): void {
  const report: ClientErrorReport = {
    message: message.slice(0, CLIENT_ERROR_MAX_MESSAGE_LENGTH),
    ...(source !== null && { source: source.slice(0, CLIENT_ERROR_MAX_SOURCE_LENGTH) }),
    route: window.location.pathname,
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
  reportError(event.message, source)
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const source = reason instanceof Error ? topStackFrame(reason.stack) : null
  reportError(message, source)
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
