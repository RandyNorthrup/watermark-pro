import { Link } from '@tanstack/react-router'
import { Trans, useTranslation } from 'react-i18next'

import { BrandMark } from './brand-mark'
import { ThemeToggle } from './theme-toggle'
import { Card } from './ui/card'
import { APP_SOURCE_URL, LEGAL_LINKS } from '../../shared/constants'

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
 * and Card so the two pages match the rest of the site. Shared by both lazy legal routes so neither pulls its UI into the boot module.
 */
export function LegalPage({ title, lastUpdated, intro, sections, sibling }: LegalPageProps) {
  const { t, i18n } = useTranslation()
  const updatedDate = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(lastUpdated))
  return (
    <div className="workspace-scene flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <BrandMark />
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle data-prerender="theme-toggle" />
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
          <p className="text-sm text-ink-muted">
            <time dateTime={lastUpdated}>{t('legal.lastUpdated', { date: updatedDate })}</time>
          </p>
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
                  <Trans
                    defaults={paragraph}
                    components={{
                      support: (
                        <a
                          href={LEGAL_LINKS.support}
                          className="underline underline-offset-4 hover:text-ink"
                        />
                      ),
                      security: (
                        <a
                          href={LEGAL_LINKS.security}
                          className="underline underline-offset-4 hover:text-ink"
                        />
                      ),
                      turnstile: (
                        <a
                          href={LEGAL_LINKS.turnstile}
                          className="underline underline-offset-4 hover:text-ink"
                        />
                      ),
                    }}
                  />
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
        <p>{t('legal.footer')}</p>
        <a
          href={APP_SOURCE_URL}
          className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink"
        >
          {t('landing.github')}
        </a>
      </footer>
    </div>
  )
}
