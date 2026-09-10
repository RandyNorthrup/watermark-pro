import { Link } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BrandMark } from './brand-mark'
import { LandingFeatures } from './landing-features'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import { APP_SOURCE_URL } from '../../shared/constants'

const STEPS = [
  { title: 'landing.steps.openTitle', body: 'landing.steps.openBody' },
  { title: 'landing.steps.markTitle', body: 'landing.steps.markBody' },
  { title: 'landing.steps.exportTitle', body: 'landing.steps.exportBody' },
] as const
const HERO_SIZES =
  '(min-width: 1280px) 1196px, (min-width: 640px) calc(100vw - 84px), calc(100vw - 56px)'
const HERO_WIDTHS = { small: 480, medium: 720, large: 960, full: 1440 } as const

function heroSources(theme: 'light' | 'dark') {
  return Object.values(HERO_WIDTHS)
    .map((width) => `/product/editor-${theme}-${String(width)}.webp ${String(width)}w`)
    .join(', ')
}

function heroThemeMedia() {
  const resolvedTheme =
    typeof document === 'undefined' ? undefined : document.documentElement.dataset['theme']
  if (resolvedTheme === undefined) return '(prefers-color-scheme: dark)'
  return resolvedTheme === 'dark' ? 'all' : 'not all'
}

export function LandingPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col bg-surface">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <BrandMark />
          <nav aria-label={t('landing.nav')} className="flex items-center gap-2 sm:gap-4">
            <a
              href="#tools"
              className="hidden min-h-11 items-center text-sm font-medium text-ink-muted hover:text-ink lg:inline-flex"
            >
              {t('landing.featuresNav')}
            </a>
            <span data-prerender="language-menu">
              <LanguageMenu />
            </span>
            <ThemeToggle data-prerender="theme-toggle" />
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t('landing.signIn')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-5 pt-12 sm:px-8 sm:pt-16 lg:pt-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {t('auth.inviteOnly.title')}
            </p>
            <h1 className="text-[clamp(2.4rem,4.8vw,4.2rem)] leading-[1.1] font-semibold tracking-[-0.04em] text-balance">
              {t('landing.heroTitleStart')}{' '}
              <span className="text-brand-600 dark:text-brand-300">
                {t('landing.heroTitleEnd')}
              </span>
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              {t('landing.heroBody')}
            </p>
            <p className="max-w-xl text-sm leading-6 text-ink-muted">
              {t('landing.inviteHosting')}{' '}
              <a
                href={APP_SOURCE_URL}
                className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-current dark:text-brand-300"
              >
                {t('landing.selfHost')}
              </a>
            </p>
            <Link
              to="/login"
              className="mt-1 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-brand-600 px-7 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t('landing.signIn')}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Link>
            <p className="flex items-center justify-center gap-2 text-xs text-ink-muted">
              <Check aria-hidden="true" className="size-4 shrink-0" />
              {t('landing.privacyNote')}
            </p>
          </div>
          <figure className="mt-10 sm:mt-12">
            <div className="overflow-hidden rounded-xl border border-line bg-surface-raised p-1.5 shadow-card sm:p-2">
              <picture>
                <source
                  data-theme-picture="dark"
                  media={heroThemeMedia()}
                  srcSet={heroSources('dark')}
                  sizes={HERO_SIZES}
                />
                <img
                  src="/product/editor-light.webp"
                  srcSet={heroSources('light')}
                  sizes={HERO_SIZES}
                  width={1440}
                  height={980}
                  fetchPriority="high"
                  alt={t('landing.heroAlt')}
                  className="block h-auto w-full rounded-lg"
                />
              </picture>
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-ink-muted">
              <span>{t('landing.previewLabel')}</span>
              <span>{t('landing.formatsLabel')}</span>
            </figcaption>
          </figure>
        </section>
        <LandingFeatures />
        <section
          aria-labelledby="workflow-heading"
          className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:gap-24 lg:py-20"
        >
          <div>
            <h2
              id="workflow-heading"
              className="mb-4 text-3xl leading-tight font-semibold tracking-tight"
            >
              {t('landing.workflowHeading')}
            </h2>
            <p className="text-sm leading-7 text-ink-muted">{t('landing.workflowNote')}</p>
          </div>
          <ol className="flex flex-col gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5 border-b border-line pb-6 last:border-0">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-control-line text-xs font-semibold"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="mb-1 font-semibold">{t(step.title)}</h3>
                  <p className="text-sm leading-7 text-ink-muted">{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="border-t border-line bg-surface-raised">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-ink-muted sm:px-8">
          <span>{t('landing.footer')}</span>
          <div className="flex items-center gap-5">
            <a
              href={APP_SOURCE_URL}
              className="inline-flex min-h-11 items-center hover:text-ink hover:underline"
            >
              {t('landing.github')}
            </a>
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center hover:text-ink hover:underline"
            >
              {t('landing.privacy')}
            </Link>
            <Link
              to="/terms"
              className="inline-flex min-h-11 items-center hover:text-ink hover:underline"
            >
              {t('landing.terms')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
