import { PUBLIC_SIGNUP_POLICY } from '../../shared/public-signup'
import { publicAdmissionEmailHash } from '../auth/public-admission-key'
import type { PublicAdmissionStore } from '../public-admission-store'

interface AdmissionUser {
  membershipCohort?: string
  id?: string
  email?: string
  banned?: boolean | null
}

/** Only persistence is replaced; holds bind the same reserved user identity as the D1 adapter. */
export function createMemoryPublicAdmissionStore(
  tables: { user: AdmissionUser[] },
  secret: string,
): PublicAdmissionStore {
  const holds = new Map<string, { userId: string; expiresAt: number; consumedAt: number | null }>()
  return {
    async reserve(email) {
      const hash = await publicAdmissionEmailHash(email, secret)
      const now = Date.now()
      for (const [key, hold] of holds)
        if (
          (hold.consumedAt !== null && hold.consumedAt <= now - PUBLIC_SIGNUP_POLICY.windowMs) ||
          (hold.consumedAt === null &&
            hold.expiresAt <= now &&
            tables.user.every((user) => user.id !== hold.userId))
        )
          holds.delete(key)
      const existing = holds.get(hash)
      if (existing !== undefined)
        return existing.consumedAt === null && existing.expiresAt > now ? existing.userId : null
      const daily = holds
        .values()
        .filter(
          (hold) =>
            (hold.consumedAt !== null && hold.consumedAt > now - PUBLIC_SIGNUP_POLICY.windowMs) ||
            (hold.consumedAt === null && hold.expiresAt > now),
        )
        .toArray().length
      const pending = holds
        .values()
        .filter(
          (hold) =>
            hold.consumedAt === null &&
            tables.user.every(
              (user) => user.id !== hold.userId || user.membershipCohort === 'pending',
            ) &&
            (hold.expiresAt > now ||
              tables.user.some(
                (user) => user.id === hold.userId && user.membershipCohort === 'pending',
              )),
        )
        .toArray().length
      if (
        daily >= PUBLIC_SIGNUP_POLICY.admissionsPerWindow ||
        tables.user.filter((user) => user.membershipCohort === 'public').length + pending >=
          PUBLIC_SIGNUP_POLICY.maximumAccounts
      )
        return null
      const userId = crypto.randomUUID()
      holds.set(hash, {
        userId,
        expiresAt: now + PUBLIC_SIGNUP_POLICY.reservationMs,
        consumedAt: null,
      })
      return userId
    },
    async activate(email, userId) {
      const hold = holds.get(await publicAdmissionEmailHash(email, secret))
      const user = tables.user.find(
        (candidate) =>
          candidate.id === userId &&
          candidate.email?.toLowerCase() === email.toLowerCase() &&
          candidate.membershipCohort === 'pending' &&
          candidate.banned !== true,
      )
      if (
        user === undefined ||
        hold?.userId !== userId ||
        hold.consumedAt !== null ||
        hold.expiresAt <= Date.now()
      )
        return false
      hold.consumedAt = Date.now()
      user.membershipCohort = 'public'
      return true
    },
    async release(email, userId) {
      const hash = await publicAdmissionEmailHash(email, secret)
      const hold = holds.get(hash)
      if (
        hold?.userId === userId &&
        hold.consumedAt === null &&
        tables.user.every((user) => user.id !== userId)
      )
        holds.delete(hash)
    },
  }
}
