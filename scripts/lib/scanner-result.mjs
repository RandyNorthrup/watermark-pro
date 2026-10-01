/** Classify scanner completion using finite metadata, never private stdout/stderr. */
export function scannerFailureReason(result) {
  if (result.error?.code === 'ETIMEDOUT') return 'timeout'
  if (result.error !== undefined) return 'execution'
  if (result.signal !== null) return 'signal'
  if (result.status !== 0 && result.status !== 1) return 'exit'
  return null
}
