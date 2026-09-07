import { createFileRoute, Link } from '@tanstack/react-router'

import { APP_NAME } from '../../shared/constants'
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
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm text-ink-muted">Last updated {lastUpdated}</p>
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
          Read the{' '}
          <Link to={sibling.to} className="font-medium text-brand-600 dark:text-brand-300">
            {sibling.label}
          </Link>
          , or return to the{' '}
          <Link to="/" className="font-medium text-brand-600 dark:text-brand-300">
            home page
          </Link>
          .
        </Card>
      </main>
      <footer className="border-t border-line px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-muted">
        {APP_NAME} is open source under the MIT licence.
      </footer>
    </div>
  )
}

const LAST_UPDATED = 'September 7, 2026'

const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    heading: 'Your photos stay in your browser',
    paragraphs: [
      'Watermarking runs entirely on your device. The editor and the bulk tool decode your photos in the browser, render them in Web Workers, and build the finished files in memory. Previewing a watermark never uploads the photo it is applied to.',
      'Exports are assembled locally and handed to you through a same-origin download link that is released the instant the download starts. Your originals are never sent to a server to be previewed or watermarked.',
    ],
  },
  {
    heading: 'What we store, and only when you ask',
    paragraphs: [
      'Nothing is kept on our servers unless you choose to save it. When you save a photo, a thumbnail, or a logo, it is stored in Cloudflare R2 under keys scoped to your organization, never made public, and served only to signed-in members of that organization with private caching.',
      'Each organization has photo, logo, and storage quotas. Every upload and deletion is recorded in the audit trail.',
    ],
  },
  {
    heading: 'Metadata is removed by default',
    paragraphs: [
      'Every export is re-encoded from pixels, so no metadata is carried over unless you decide to keep it. The default strips all camera and location data before the file reaches your download, the share sheet, or the gallery.',
      'Two opt-in per-export modes let you keep the camera data with the GPS location removed, or keep everything as-is. Metadata is read and written in the browser; nothing is uploaded to do it.',
    ],
  },
  {
    heading: 'Sharing links',
    paragraphs: [
      'A share link carries a signed token with a built-in expiry and can be revoked at any time. The public pages a link opens carry no session and are rate limited by address.',
      'Expired, revoked, tampered, and unknown links all return the same neutral “not found” response, so a link reveals nothing once it stops working. Creating and revoking links is limited to members with permission and is audited.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'An account needs an email address and a password, and the email must be verified before the account is active. Sessions are held in HttpOnly, SameSite=Lax cookies, marked Secure on secure origins.',
      'Password-reset links expire after an hour and sign out your other sessions when used.',
    ],
  },
  {
    heading: 'Analytics and cookies',
    paragraphs: [
      'We set no third-party analytics or advertising cookies. The only measurement is Cloudflare Web Analytics, which is cookieless and does not track you across sites.',
      'The app talks to just two third-party origins, both Cloudflare’s: the Turnstile widget that screens sign-up and password-reset requests for bots, and the cookieless analytics beacon. Fonts, styles, and everything else are served from this site.',
    ],
  },
  {
    heading: 'Audit trail',
    paragraphs: [
      'Sign-ups and every organization, membership, invitation, library, photo, and share change are written to an append-only audit log. That log is readable only by an organization’s owners and admins.',
    ],
  },
  {
    heading: 'Reporting a problem',
    paragraphs: [
      'Security issues can be reported privately through the project’s GitHub repository rather than a public issue. The security policy in the repository describes what to include and how quickly you will hear back.',
    ],
  },
]

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      lastUpdated={LAST_UPDATED}
      intro={`${APP_NAME} is built so your photographs stay yours. This page explains what happens to your images and your account information in plain language, drawn from the controls the project actually enforces.`}
      sections={PRIVACY_SECTIONS}
      sibling={{ to: '/terms', label: 'terms of service' }}
    />
  )
}
