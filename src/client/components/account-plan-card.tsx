import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Field } from './ui/field'
import { Input } from './ui/input'
import {
  billingCheckoutRequestSchema,
  billingOverviewSchema,
  billingRedirectSchema,
  billingScopeRequestSchema,
} from '../../shared/billing-client'
import { BYTES_PER_MEGABYTE } from '../../shared/constants'
import { workspaceCapacitySchema } from '../../shared/plans'
import { fetchJson } from '../lib/api'
import { describeError } from '../lib/errors'
import { organizationsQueryOptions } from '../lib/queries'

const names = { free: 'pricing.free', pro: 'pricing.pro', team: 'pricing.team' } as const
const scopes = { pro: 'pricing.personal', team: 'pricing.team' } as const
const checkoutLabels = { pro: 'pricing.upgrade', team: 'pricing.createTeam' } as const

/** Current capacity is separate from financial eligibility; every billing action uses the server overview. */
export function AccountPlanCard({
  organizationId,
  userId,
  billingReturn,
  billingPlan,
}: {
  organizationId: string
  userId: string
  billingReturn?: string | undefined
  billingPlan?: 'pro' | 'team' | undefined
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const overviewKey = ['billing-overview', userId]
  const overview = useQuery({
    queryKey: overviewKey,
    queryFn: async () => await fetchJson('/api/me/billing', billingOverviewSchema),
  })
  const data = overview.data
  const canEditTeamName =
    data?.team === null ||
    (data?.team?.organizationId === null &&
      data.team.canCheckout &&
      data.team.checkoutState !== 'open')
  const capacity = useQuery({
    queryKey: ['workspace-capacity', userId, organizationId],
    queryFn: async () =>
      await fetchJson(
        `/api/orgs/${encodeURIComponent(organizationId)}/capacity`,
        workspaceCapacitySchema,
      ),
  })
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<{ body: string; id: string } | null>(null)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  async function action(
    plan: 'pro' | 'team',
    operation: 'checkout' | 'portal' | 'cancel' | 'reconcile',
  ) {
    if (data?.configured !== true) return
    const status = plan === 'pro' ? data.personal : data.team
    if (
      operation === 'checkout' &&
      (status?.canCheckout === false ||
        (plan === 'team' && canEditTeamName && newWorkspaceName.trim() === ''))
    )
      return
    if (operation === 'portal' && status?.canManageBilling !== true) return
    setPending(true)
    setError(null)
    try {
      if (operation === 'checkout') {
        const teamIntent =
          status?.organizationId == null
            ? {
                newWorkspaceName: canEditTeamName ? newWorkspaceName : status?.workspaceName,
              }
            : { organizationId: status.organizationId }
        const product = { plan, ...(plan === 'team' && teamIntent) }
        const body = JSON.stringify(product)
        if (intent.current?.body !== body) intent.current = { body, id: crypto.randomUUID() }
        const request = billingCheckoutRequestSchema.parse({
          ...product,
          requestId: intent.current.id,
        })
        const result = await fetchJson('/api/me/billing/checkout', billingRedirectSchema, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        window.location.assign(result.url)
      } else if (operation === 'portal') {
        const result = await fetchJson('/api/me/billing/portal', billingRedirectSchema, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(billingScopeRequestSchema.parse({ plan })),
        })
        window.location.assign(result.url)
      } else {
        const path =
          operation === 'cancel' ? '/api/me/billing/checkout/cancel' : '/api/me/billing/reconcile'
        const result = await fetchJson(path, billingOverviewSchema, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(billingScopeRequestSchema.parse({ plan })),
        })
        queryClient.setQueryData(overviewKey, result)
        intent.current = null
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: organizationsQueryOptions.queryKey }),
          queryClient.invalidateQueries({ queryKey: ['workspace-capacity', userId] }),
        ])
      }
    } catch (error_) {
      setError(describeError(error_))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <h2 className="text-xl font-semibold">{t('pricing.accountHeading')}</h2>
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {overview.isError ? <Alert tone="error">{describeError(overview.error)}</Alert> : null}
      {capacity.isError ? <Alert tone="error">{describeError(capacity.error)}</Alert> : null}
      {capacity.data === undefined ? (
        <p role="status">{t('accountAuth.loading')}</p>
      ) : (
        <div>
          <p className="mb-3 text-sm text-ink-muted">{t('pricing.allowance')}</p>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-ink-muted">{t('admin.th.storage')}</dt>
              <dd className="mt-1 font-semibold">
                <bdi>
                  {t('pricing.storageAmount', {
                    value: number.format(capacity.data.storageBytes / BYTES_PER_MEGABYTE),
                  })}
                </bdi>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('admin.th.photos')}</dt>
              <dd className="mt-1 font-semibold">{number.format(capacity.data.photos)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('library.describe.logo')}</dt>
              <dd className="mt-1 font-semibold">{number.format(capacity.data.logos)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('library.heading')}</dt>
              <dd className="mt-1 font-semibold">{number.format(capacity.data.presets)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('dashboard.members')}</dt>
              <dd className="mt-1 font-semibold">{number.format(capacity.data.members)}</dd>
            </div>
          </dl>
        </div>
      )}
      {data?.configured === true ? (
        <div className="flex flex-col gap-5 border-t border-line pt-5">
          <p className="text-sm leading-6 text-ink-muted">{t('pricing.redirectNotice')}</p>
          {billingReturn === undefined ? null : (
            <p role="status" className="text-sm text-ink-muted">
              {t('pricing.refreshNotice')}
            </p>
          )}
          {(['pro', 'team'] as const).map((plan) => {
            const status = plan === 'pro' ? data.personal : data.team
            const hasOpenCheckout = status?.checkoutState === 'open'
            return (
              <section
                key={plan}
                aria-label={t(scopes[plan])}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">{t(scopes[plan])}</h3>
                  {status === null ? null : <Badge>{t(names[status.plan])}</Badge>}
                </div>
                {status?.workspaceName == null ? null : (
                  <p className="mt-2 text-sm text-ink-muted">{status.workspaceName}</p>
                )}
                {plan === 'team' && canEditTeamName ? (
                  <Field label={t('pricing.sharedName')}>
                    {(control) => (
                      <Input
                        {...control}
                        value={newWorkspaceName}
                        onChange={(event) => setNewWorkspaceName(event.target.value)}
                      />
                    )}
                  </Field>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    isPending={pending}
                    disabled={
                      status?.canCheckout === false ||
                      (plan === 'team' && canEditTeamName && newWorkspaceName.trim() === '')
                    }
                    onClick={() => void action(plan, 'checkout')}
                  >
                    {t(hasOpenCheckout ? 'pricing.resume' : checkoutLabels[plan])}
                  </Button>
                  {status?.canManageBilling === true ? (
                    <Button
                      variant="secondary"
                      isPending={pending}
                      onClick={() => void action(plan, 'portal')}
                    >
                      {t('pricing.manage')}
                    </Button>
                  ) : null}
                  {hasOpenCheckout ? (
                    <Button
                      variant="secondary"
                      isPending={pending}
                      onClick={() => void action(plan, 'cancel')}
                    >
                      {t('pricing.cancelCheckout')}
                    </Button>
                  ) : null}
                  {status === null ? null : (
                    <Button
                      variant="ghost"
                      isPending={pending}
                      onClick={() => void action(plan, 'reconcile')}
                    >
                      {t('pricing.refresh')}
                    </Button>
                  )}
                </div>
                {billingPlan === plan ? (
                  <p className="mt-3 text-sm text-ink-muted">{t('pricing.refreshNotice')}</p>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t('pricing.soon')}</p>
      )}
      <p className="text-sm leading-6 text-ink-muted">{t('pricing.scope')}</p>
    </Card>
  )
}
