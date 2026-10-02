/** Human challenges are abuse signals; they never grant account roles or workspace access. */
import { z } from 'zod'

export const HUMAN_VERIFICATION = {
  actions: { admission: 'account_admission', recovery: 'password_recovery' },
  maxTokenCharacters: 2048,
} as const

/** Bound the opaque provider token before forwarding it to Cloudflare. */
export const humanChallengeTokenSchema = z
  .string()
  .min(1)
  .max(HUMAN_VERIFICATION.maxTokenCharacters)
