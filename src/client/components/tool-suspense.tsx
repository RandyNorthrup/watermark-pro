import { type ReactNode, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from './ui/spinner'

/** Holds a lazily loaded tool's place under the page heading (`tool-modules.ts`). */
export function ToolSuspense({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div className="flex min-h-48 items-center justify-center">
          <Spinner className="size-6" label={t('shell.loadingTools')} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
