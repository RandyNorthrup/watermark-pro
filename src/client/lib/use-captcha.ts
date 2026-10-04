import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { publicConfigQueryOptions } from './queries'
import { humanChallengeTokenSchema } from '../../shared/human-verification'

/**
 * Turnstile state for a protected form: whether the widget must be shown,
 * the token it produced, and the header to send with the auth request.
 * Configuration must load successfully before admission can proceed. Reset
 * after every attempted request because the provider consumes tokens once.
 */
export function useCaptcha() {
  const config = useQuery(publicConfigQueryOptions)
  const [token, setToken] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const siteKey = config.data?.turnstileSiteKey ?? null
  const onToken = useCallback((next: string | null) => {
    const parsed = humanChallengeTokenSchema.safeParse(next)
    setToken(parsed.success ? parsed.data : null)
  }, [])
  const isRequired = siteKey !== null
  const reset = useCallback(() => {
    setToken(null)
    setGeneration((current) => current + 1)
  }, [])
  return {
    siteKey,
    onToken,
    generation,
    reset,
    isUnavailable: config.isError,
    /** Unknown/failed configuration and unsolved required challenges block admission. */
    isReady: config.isSuccess && (!isRequired || token !== null),
    headers: token === null ? {} : { 'x-captcha-response': token },
  }
}
