import { useEffect, useRef, useState } from 'react'

import { readTheme } from '../lib/theme'

/** Cloudflare's widget script; the only third-party script the CSP allows. */
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      theme: 'light' | 'dark' | 'auto'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** One in-flight script load per page; kept on an object so callers can reset it. */
const loader: { pending: Promise<TurnstileApi> | null } = { pending: null }

function injectScript(): Promise<TurnstileApi> {
  return new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.addEventListener('load', () => {
      if (window.turnstile === undefined) {
        reject(new Error('Turnstile did not initialise'))
      } else {
        resolve(window.turnstile)
      }
    })
    script.addEventListener('error', () => {
      loader.pending = null
      reject(new Error('Turnstile could not be loaded'))
    })
    document.head.append(script)
  })
}

/** Loads the widget script once per page and resolves with its API. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) {
    return Promise.resolve(window.turnstile)
  }
  loader.pending ??= injectScript()
  return loader.pending
}

function widgetTheme(): 'light' | 'dark' | 'auto' {
  const theme = readTheme()
  return theme === 'system' ? 'auto' : theme
}

interface TurnstileProps {
  siteKey: string
  /** Called with a fresh token, or `null` when the token expires or the widget fails. */
  onToken: (token: string | null) => void
}

/**
 * Cloudflare Turnstile challenge. Renders nothing visible until the widget
 * script has loaded; the caller keeps its submit disabled until `onToken`
 * delivers a token.
 */
export function Turnstile({ siteKey, onToken }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }
    let widgetId: string | null = null
    let isCancelled = false
    async function mount(target: HTMLDivElement) {
      try {
        const turnstile = await loadTurnstile()
        if (isCancelled) {
          return
        }
        widgetId = turnstile.render(target, {
          sitekey: siteKey,
          theme: widgetTheme(),
          callback: onToken,
          'expired-callback': () => {
            onToken(null)
          },
          'error-callback': () => {
            onToken(null)
            setError('The bot check failed to load. Reload the page and try again.')
          },
        })
      } catch (error_) {
        if (!isCancelled) {
          setError(error_ instanceof Error ? error_.message : 'Turnstile could not be loaded')
        }
      }
    }
    void mount(container)
    return () => {
      isCancelled = true
      if (widgetId !== null && window.turnstile !== undefined) {
        window.turnstile.remove(widgetId)
      }
    }
  }, [siteKey, onToken])

  return (
    <div className="flex flex-col gap-1">
      <div ref={containerRef} aria-label="Bot check" />
      {error === null ? null : (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
