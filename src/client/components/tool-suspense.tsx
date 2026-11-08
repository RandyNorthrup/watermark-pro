import { type ReactNode, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from './ui/spinner'

/** True once the browser has painted the page's first frame. */
function useHasPainted(): boolean {
  const [isPainted, setPainted] = useState(false)
  useEffect(() => {
    // The animation frame runs just before the next paint; the task it
    // schedules runs after that paint.
    let timer: ReturnType<typeof setTimeout> | undefined
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        setPainted(true)
      }, 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [])
  return isPainted
}

/**
 * Holds a lazily loaded tool's place under the page heading (`tool-modules.ts`)
 * and starts the tool's download once that heading has painted, so the page's
 * own code is not competing with the tool's for a phone's bandwidth (PLAN.md
 * §5.5). `pending` shows the tool's own first view above the loading status
 * when it has one that needs no tool code.
 */
export function ToolSuspense({ children, pending }: { children: ReactNode; pending?: ReactNode }) {
  const { t } = useTranslation()
  const isPainted = useHasPainted()
  const placeholder = (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3">
      {pending}
      <Spinner className="size-6" label={t('shell.loadingTools')} />
    </div>
  )
  return <Suspense fallback={placeholder}>{isPainted ? children : placeholder}</Suspense>
}
