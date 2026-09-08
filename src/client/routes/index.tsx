import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Images, Layers, ShieldCheck, Sparkles, Users, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { APP_TAGLINE } from '../../shared/constants'
import { BrandMark } from '../components/brand-mark'
import { ThemeToggle } from '../components/theme-toggle'
import { Card } from '../components/ui/card'
import { sessionQueryOptions } from '../lib/queries'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQueryOptions)
    if (session !== null) {
      throw redirect({ to: '/app' })
    }
  },
  component: LandingPage,
})

const FEATURES = [
  {
    icon: Layers,
    titleKey: 'landing.features.bulk.title',
    bodyKey: 'landing.features.bulk.body',
  },
  {
    icon: Images,
    titleKey: 'landing.features.library.title',
    bodyKey: 'landing.features.library.body',
  },
  {
    icon: Wand2,
    titleKey: 'landing.features.smart.title',
    bodyKey: 'landing.features.smart.body',
  },
  {
    icon: Sparkles,
    titleKey: 'landing.features.contrast.title',
    bodyKey: 'landing.features.contrast.body',
  },
  {
    icon: Users,
    titleKey: 'landing.features.teams.title',
    bodyKey: 'landing.features.teams.body',
  },
  {
    icon: ShieldCheck,
    titleKey: 'landing.features.trusted.title',
    bodyKey: 'landing.features.trusted.body',
  },
] as const

function LandingPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <BrandMark />
        <nav aria-label={t('landing.nav')} className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-muted hover:text-ink"
          >
            {t('landing.signIn')}
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white shadow-sm hover:bg-brand-700"
          >
            {t('landing.createAccount')}
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-10 sm:px-6 sm:py-16 md:gap-16">
        <section className="flex max-w-3xl flex-col gap-6">
          <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            {t('landing.eyebrow')}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {APP_TAGLINE}
          </h1>
          <p className="max-w-prose text-lg text-ink-muted">{t('landing.heroBody')}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-5 py-3 text-center text-sm font-medium text-white shadow-sm hover:bg-brand-700 max-sm:w-full"
            >
              {t('landing.createWorkspace')}
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-line bg-surface-raised px-5 py-3 text-center text-sm font-medium hover:bg-brand-50 max-sm:w-full"
            >
              {t('landing.signIn')}
            </Link>
          </div>
        </section>
        <section aria-labelledby="features-heading" className="flex flex-col gap-6">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
            {t('landing.featuresHeading')}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
              <li key={titleKey}>
                <Card className="flex h-full flex-col gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-semibold">{t(titleKey)}</h3>
                  <p className="text-sm text-ink-muted">{t(bodyKey)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-muted">
        <span>{t('landing.footer')}</span>
        <Link to="/privacy" className="hover:text-ink hover:underline">
          {t('landing.privacy')}
        </Link>
        <Link to="/terms" className="hover:text-ink hover:underline">
          {t('landing.terms')}
        </Link>
      </footer>
    </div>
  )
}
