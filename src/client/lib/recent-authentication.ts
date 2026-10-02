/** Transient re-sign-in prompts retain the request's account boundary, never credentials. */
import { captureOfflineOwner } from './offline-context'

const listeners = new Set<() => void>()
const prompt: { owner: ReturnType<typeof captureOfflineOwner> | null } = { owner: null }

/** Announces a refused action only while its original account generation remains current. */
export function requestRecentAuthentication(owner = captureOfflineOwner()): void {
  owner.assertCurrent()
  prompt.owner = owner
  for (const listener of listeners) listener()
}

/** Dismissal and completed sign-in never replay the refused mutation. */
export function dismissRecentAuthentication(): void {
  prompt.owner = null
  for (const listener of listeners) listener()
}

/** A stale account's refusal cannot appear on another account, including a later same-id session. */
export function recentAuthenticationAccount(): string | null {
  if (prompt.owner === null) return null
  try {
    prompt.owner.assertCurrent()
  } catch {
    return null
  }
  return prompt.owner.userId
}

/** React subscribes only while the authenticated area is mounted. */
export function subscribeRecentAuthentication(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
