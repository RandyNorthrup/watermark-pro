import type { ReactNode } from 'react'

import { APP_NAME } from '../../shared/constants'

interface AppShellProps {
  children: ReactNode
}

/**
 * Page chrome shared by every route: header with the product mark, the main
 * content region, and a footer. Navigation items arrive with the M1 design
 * system once authenticated areas exist.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface-raised/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <span
            aria-hidden="true"
            className="inline-block size-8 rounded-lg bg-linear-to-br from-brand-500 to-accent-500"
          />
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6">{children}</main>
      <footer className="border-t border-line px-6 py-6 text-center text-sm text-ink-muted">
        {APP_NAME} is open source under the MIT licence.
      </footer>
    </div>
  )
}
