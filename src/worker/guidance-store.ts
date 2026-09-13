import type { GuidanceTopic } from '../shared/guidance'

/** A successful claim permanently consumes a topic for the authenticated account. */
export interface GuidanceStore {
  claim(userId: string, topic: GuidanceTopic): Promise<boolean>
}
