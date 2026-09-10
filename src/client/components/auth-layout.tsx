import type { ReactNode } from 'react'

import { BrandMark } from './brand-mark'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import { Card } from './ui/card'

interface AuthLayoutProps {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

/** Centered card used by every public authentication screen. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="workspace-scene flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <BrandMark />
        <div className="flex items-center gap-1">
          <LanguageMenu />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <Card className="w-full max-w-md p-7 sm:p-9">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description === undefined ? null : (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          )}
          <div className="mt-6">{children}</div>
          {footer === undefined ? null : (
            <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>
          )}
        </Card>
      </main>
    </div>
  )
}
