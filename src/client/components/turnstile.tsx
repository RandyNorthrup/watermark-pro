import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { readTheme } from '../lib/theme'
import { Button } from './ui/button'

/** Cloudflare's widget script; the only third-party script the CSP allows. */
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const WIDGET_DIMENSIONS = { normalWidth: 300, normalHeight: 65, compactHeight: 140 } as const
type WidgetSize = 'normal' | 'compact'

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme: 'light' | 'dark' | 'auto'
      size: WidgetSize
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
        loader.pending = null
        script.remove()
        reject(new Error('Turnstile did not initialise'))
      } else {
        resolve(window.turnstile)
      }
    })
    script.addEventListener('error', () => {
      loader.pending = null
      script.remove()
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
  action?: string
  /** Called with a fresh token, or `null` when the token expires or the widget fails. */
  onToken: (token: string | null) => void
}

/**
 * Cloudflare Turnstile challenge. Reserve its dimensions before loading to
 * avoid shifting the form; compact sizing fits narrow authentication cards.
 * The caller keeps submission disabled until a fresh token arrives.
 */
export function Turnstile({
  siteKey,
  action = HUMAN_VERIFICATION.actions.admission,
  onToken,
}: TurnstileProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<'failed' | 'unavailable' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [size, setSize] = useState<WidgetSize>('compact')

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const measure = () => {
      const next: WidgetSize =
        container.getBoundingClientRect().width < WIDGET_DIMENSIONS.normalWidth
          ? 'compact'
          : 'normal'
      setSize(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }
    let widgetId: string | null = null
    let isCancelled = false
    // A resized/remounted widget must not leave a token from its predecessor.
    onToken(null)
    async function mount(target: HTMLDivElement) {
      try {
        const turnstile = await loadTurnstile()
        if (isCancelled) {
          return
        }
        widgetId = turnstile.render(target, {
          sitekey: siteKey,
          action,
          theme: widgetTheme(),
          size,
          callback: (token) => {
            if (isCancelled) {
              return
            }

            setError(null)
            onToken(token)
          },
          'expired-callback': () => {
            if (!isCancelled) onToken(null)
          },
          'error-callback': () => {
            if (isCancelled) return
            onToken(null)
            setError('failed')
          },
        })
      } catch {
        if (!isCancelled) {
          onToken(null)
          setError('unavailable')
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
  }, [siteKey, action, onToken, attempt, size])

  return (
    <div className="mb-4 flex flex-col gap-1">
      <div
        ref={containerRef}
        role="group"
        aria-label={t('auth.humanCheck.label')}
        style={{
          minHeight:
            size === 'compact' ? WIDGET_DIMENSIONS.compactHeight : WIDGET_DIMENSIONS.normalHeight,
        }}
      />
      {error === null ? null : (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {t(error === 'failed' ? 'auth.humanCheck.failed' : 'auth.humanCheck.unavailable')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onToken(null)
              setError(null)
              setAttempt((current) => current + 1)
            }}
          >
            {t('auth.humanCheck.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
