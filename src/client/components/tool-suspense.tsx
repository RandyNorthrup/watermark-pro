import { type ReactNode, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from './ui/spinner'

/**
 * Holds a lazily loaded tool's place under the page heading (`tool-modules.ts`).
 * `pending` shows the tool's own first view above the loading status when it
 * has one that needs no tool code.
 */
export function ToolSuspense({ children, pending }: { children: ReactNode; pending?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div className="flex min-h-48 flex-col items-center justify-center gap-3">
          {pending}
          <Spinner className="size-6" label={t('shell.loadingTools')} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
