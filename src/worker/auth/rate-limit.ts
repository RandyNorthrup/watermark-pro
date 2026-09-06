import { API_RATE_LIMIT, AUTH_RATE_LIMIT, SENSITIVE_AUTH_PATHS } from '../../shared/constants'

/**
 * Better Auth's custom rate-limit storage contract: check and increment in
 * one step so concurrent requests cannot all pass a stale read.
 */
export interface RateLimitStorage {
  consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }>
}

/**
 * Routes Better Auth's rate-limit checks to the Workers Rate Limiting
 * bindings. Better Auth builds the key as `${ip}|${path}`; credential and
 * token endpoints go to the strict limiter, everything else to the general
 * one. The bindings hold the authoritative limits (wrangler.jsonc), so the
 * `rule` argument is only used to report an accurate Retry-After.
 */
export function createBindingRateLimitStorage(
  strict: RateLimit,
  general: RateLimit,
): RateLimitStorage {
  return {
    async consume(key, rule) {
      const path = key.slice(key.indexOf('|') + 1)
      const isSensitive = SENSITIVE_AUTH_PATHS.some((sensitive) => path.endsWith(sensitive))
      const limiter = isSensitive ? strict : general
      const { success } = await limiter.limit({ key })
      if (success) {
        return { allowed: true, retryAfter: null }
      }
      const window = isSensitive ? AUTH_RATE_LIMIT.windowSeconds : API_RATE_LIMIT.windowSeconds
      return { allowed: false, retryAfter: Math.max(rule.window, window) }
    },
  }
}

/** Never limits. Only for Node unit tests, which have no binding to talk to. */
export const unlimitedRateLimitStorage: RateLimitStorage = {
  consume: () => Promise.resolve({ allowed: true, retryAfter: null }),
}
