import { createFileRoute, Link } from '@tanstack/react-router'
import { Trans, useTranslation } from 'react-i18next'

import { BrandMark } from '../components/brand-mark'
import { ThemeToggle } from '../components/theme-toggle'
import { Card } from '../components/ui/card'

/** One titled block of a legal page: a heading and one or more paragraphs. */
export interface LegalSection {
  readonly heading: string
  readonly paragraphs: readonly string[]
}

export interface LegalPageProps {
  readonly title: string
  readonly lastUpdated: string
  readonly intro: string
  readonly sections: readonly LegalSection[]
  /** The other legal page, linked at the foot so the pair is navigable. */
  readonly sibling: { readonly to: '/privacy' | '/terms'; readonly label: string }
}

/**
 * Shared shell for the public legal pages, reusing the landing header, footer
 * and Card so the two pages match the rest of the site. Lives here and is
 * imported by the terms page so the markup exists once.
 */
export function LegalPage({ title, lastUpdated, intro, sections, sibling }: LegalPageProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <BrandMark />
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-muted hover:text-ink"
          >
            {t('legal.signIn')}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm text-ink-muted">{t('legal.lastUpdated', { date: lastUpdated })}</p>
          <p className="max-w-prose text-lg text-ink-muted">{intro}</p>
        </div>
        {sections.map((section, index) => {
          const headingId = `legal-section-${String(index)}`
          return (
            <section
              key={section.heading}
              aria-labelledby={headingId}
              className="flex flex-col gap-3"
            >
              <h2 id={headingId} className="text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="max-w-prose text-ink-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          )
        })}
        <Card className="text-sm text-ink-muted">
          <Trans
            i18nKey="legal.readSibling"
            values={{ siblingLabel: sibling.label }}
            components={{
              sibling: (
                <Link to={sibling.to} className="font-medium text-brand-600 dark:text-brand-300" />
              ),
              home: <Link to="/" className="font-medium text-brand-600 dark:text-brand-300" />,
            }}
          />
        </Card>
      </main>
      <footer className="border-t border-line px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-muted">
        {t('legal.footer')}
      </footer>
    </div>
  )
}

const LAST_UPDATED = 'September 7, 2026'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

function PrivacyPage() {
  const { t } = useTranslation()
  const sections: readonly LegalSection[] = [
    {
      heading: t('legal.privacy.photos.heading'),
      paragraphs: [t('legal.privacy.photos.p1'), t('legal.privacy.photos.p2')],
    },
    {
      heading: t('legal.privacy.storage.heading'),
      paragraphs: [t('legal.privacy.storage.p1'), t('legal.privacy.storage.p2')],
    },
    {
      heading: t('legal.privacy.metadata.heading'),
      paragraphs: [t('legal.privacy.metadata.p1'), t('legal.privacy.metadata.p2')],
    },
    {
      heading: t('legal.privacy.sharing.heading'),
      paragraphs: [t('legal.privacy.sharing.p1'), t('legal.privacy.sharing.p2')],
    },
    {
      heading: t('legal.privacy.account.heading'),
      paragraphs: [t('legal.privacy.account.p1'), t('legal.privacy.account.p2')],
    },
    {
      heading: t('legal.privacy.analytics.heading'),
      paragraphs: [t('legal.privacy.analytics.p1'), t('legal.privacy.analytics.p2')],
    },
    {
      heading: t('legal.privacy.audit.heading'),
      paragraphs: [t('legal.privacy.audit.p1')],
    },
    {
      heading: t('legal.privacy.reporting.heading'),
      paragraphs: [t('legal.privacy.reporting.p1')],
    },
  ]
  return (
    <LegalPage
      title={t('legal.privacy.title')}
      lastUpdated={LAST_UPDATED}
      intro={t('legal.privacy.intro')}
      sections={sections}
      sibling={{ to: '/terms', label: t('legal.privacy.siblingLabel') }}
    />
  )
}
