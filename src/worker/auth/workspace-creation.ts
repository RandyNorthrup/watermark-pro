const CREATION_FAILURE = { quotaMarker: 'workspace_creation_quota' } as const

/** Recognize only the durable creation guard, including driver wrappers and cyclic causes. */
export function isWorkspaceCreationQuotaFailure(error: unknown): boolean {
  const seen = new Set<object>()
  let current = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    if (
      'message' in current &&
      typeof current.message === 'string' &&
      current.message.includes(CREATION_FAILURE.quotaMarker)
    )
      return true
    seen.add(current)
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}
