import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from './ui/button-variants'

/**
 * The root route's fallback for an unknown address. It loads on demand like
 * every page component, so the application shell does not carry it
 * (PLAN.md §5.5 shell budget).
 */
export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t('root.notFound.title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('root.notFound.body')}</p>
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        {t('root.notFound.back')}
      </Link>
    </main>
  )
}
