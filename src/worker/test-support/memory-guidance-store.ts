import type { GuidanceStore } from '../guidance-store'

/** No await separates the membership check and insertion, matching the D1 unique constraint. */
export function createMemoryGuidanceStore(): GuidanceStore {
  const claims = new Set<string>()
  return {
    claim(userId, topic) {
      const key = JSON.stringify([userId, topic])
      if (claims.has(key)) return Promise.resolve(false)
      claims.add(key)
      return Promise.resolve(true)
    },
  }
}
