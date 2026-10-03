import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from './ui/button'
import { PUBLIC_PLANS } from '../../shared/plans'
import { publicConfigQueryOptions } from '../lib/queries'

const PLAN_COPY = {
  free: {
    title: 'pricing.free',
    body: 'pricing.freeBody',
    storage: 'pricing.freeStorage',
    photos: 'pricing.freePhotos',
    logos: 'pricing.freeLogos',
    people: 'pricing.personal',
  },
  pro: {
    title: 'pricing.pro',
    body: 'pricing.proBody',
    storage: 'pricing.proStorage',
    photos: 'pricing.paidPhotos',
    logos: 'pricing.proLogos',
    people: 'pricing.personal',
  },
  team: {
    title: 'pricing.team',
    body: 'pricing.teamBody',
    storage: 'pricing.teamStorage',
    photos: 'pricing.paidPhotos',
    logos: 'pricing.teamLogos',
    people: 'pricing.teamPeople',
  },
} as const

/** Monthly prices describe actual launch limits; server release switches own availability. */
export function PlanPricing() {
  const { t, i18n } = useTranslation()
  const config = useQuery(publicConfigQueryOptions)
  const price = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20"
    >
      <div className="mb-9 max-w-2xl">
        <p className="mb-3 text-sm font-semibold text-brand-700 dark:text-brand-300">
          {t('pricing.eyebrow')}
        </p>
        <h2 id="pricing-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('pricing.heading')}
        </h2>
        <p className="mt-4 text-base leading-7 text-ink-muted">{t('pricing.intro')}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {(['free', 'pro', 'team'] as const).map((plan) => {
          const copy = PLAN_COPY[plan]
          return (
            <article
              key={plan}
              className={`glass-panel flex flex-col rounded-2xl border p-6 sm:p-7 ${plan === 'pro' ? 'border-brand-400 dark:border-brand-500' : 'border-line'}`}
            >
              <h3 className="text-xl font-semibold">{t(copy.title)}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-ink-muted">{t(copy.body)}</p>
              <p className="my-6 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">
                  <bdi>{price.format(PUBLIC_PLANS[plan].monthlyUsd)}</bdi>
                </span>
                <span className="text-sm text-ink-muted">{t('pricing.monthly')}</span>
              </p>
              <ul className="mb-7 flex flex-1 flex-col gap-3 text-sm">
                {[copy.storage, copy.photos, copy.logos, copy.people].map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300"
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300"
                  />
                  <span>
                    <bdi>{number.format(PUBLIC_PLANS[plan].presets)}</bdi> {t('library.heading')}
                  </span>
                </li>
                {plan === 'team' ? (
                  <li className="flex items-start gap-2">
                    <Users
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300"
                    />
                    <span>{t('pricing.teamSharing')}</span>
                  </li>
                ) : null}
              </ul>
              {plan === 'free' ? (
                <Link
                  to="/signup"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {t('pricing.start')}
                </Link>
              ) : null}
              {plan !== 'free' && config.data?.billingEnabled === true ? (
                <Link
                  to="/login"
                  search={{ redirect: '/app/account' }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {t(plan === 'pro' ? 'pricing.upgrade' : 'pricing.createTeam')}
                </Link>
              ) : null}
              {plan !== 'free' && config.data?.billingEnabled !== true ? (
                <Button variant="secondary" disabled>
                  {t('pricing.soon')}
                </Button>
              ) : null}
            </article>
          )
        })}
      </div>
      <p className="mt-6 max-w-4xl text-sm leading-7 text-ink-muted">{t('pricing.scope')}</p>
    </section>
  )
}
