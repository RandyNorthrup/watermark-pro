import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Images, Layers, ShieldCheck, Sparkles, Users, Wand2 } from 'lucide-react'

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
    title: 'Bulk jobs',
    body: 'Drop hundreds of photos and watermark them all in one pass, in your browser.',
  },
  {
    icon: Images,
    title: 'Watermark library',
    body: 'Save text, symbol and logo marks once; apply them anywhere with a click.',
  },
  {
    icon: Wand2,
    title: 'Smart placement',
    body: 'Each photo is analysed so the mark lands where it reads best and stays off the subject.',
  },
  {
    icon: Sparkles,
    title: 'Auto contrast',
    body: 'Light or dark variant and outline strength chosen per image, adjustable when you disagree.',
  },
  {
    icon: Users,
    title: 'Teams and roles',
    body: 'Organizations with owner, admin, editor and viewer roles, enforced on the server.',
  },
  {
    icon: ShieldCheck,
    title: 'Built to be trusted',
    body: 'Strict content security policy, audited actions, and photos that never leave your browser unless you save them.',
  },
] as const

function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <BrandMark />
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-muted hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white shadow-sm hover:bg-brand-700"
          >
            Create account
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-10 sm:px-6 sm:py-16 md:gap-16">
        <section className="flex max-w-3xl flex-col gap-6">
          <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            Free and open source
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {APP_TAGLINE}
          </h1>
          <p className="max-w-prose text-lg text-ink-muted">
            Protect your photography without losing the picture. Watermark Pro runs the heavy
            lifting in your browser, keeps your originals private, and gives your team roles that
            actually mean something.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-5 py-3 text-center text-sm font-medium text-white shadow-sm hover:bg-brand-700 max-sm:w-full"
            >
              Create your workspace
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-line bg-surface-raised px-5 py-3 text-center text-sm font-medium hover:bg-brand-50 max-sm:w-full"
            >
              Sign in
            </Link>
          </div>
        </section>
        <section aria-labelledby="features-heading" className="flex flex-col gap-6">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
            What it does
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Card className="flex h-full flex-col gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-ink-muted">{body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-muted">
        <span>Watermark Pro is open source under the MIT licence.</span>
        <Link to="/privacy" className="hover:text-ink hover:underline">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-ink hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  )
}
