import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { publicConfigQueryOptions } from './queries'

/**
 * Turnstile state for a protected form: whether the widget must be shown,
 * the token it produced, and the header to send with the auth request.
 * While the configuration is loading the form stays usable; a server that
 * requires a token answers 400 and the user can retry once the widget shows.
 */
export function useCaptcha() {
  const config = useQuery(publicConfigQueryOptions)
  const [token, setToken] = useState<string | null>(null)
  const siteKey = config.data?.turnstileSiteKey ?? null
  const onToken = useCallback((next: string | null) => {
    setToken(next)
  }, [])
  const isRequired = siteKey !== null
  return {
    siteKey,
    onToken,
    /** True until the widget has produced a token (or when no widget is needed). */
    isReady: !isRequired || token !== null,
    headers: token === null ? {} : { 'x-captcha-response': token },
  }
}
