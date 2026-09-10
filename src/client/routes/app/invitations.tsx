import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { siteInvitationRequestSchema } from '../../../shared/api-accounts'
import { ReferralInvitation } from '../../components/referral-invitation'
import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { inviteToSite, revokeSiteInvitation, siteInvitationsQueryOptions } from '../../lib/accounts'
import { describeError } from '../../lib/errors'
import { dateTimeFormatter } from '../../lib/format-date'

export const Route = createFileRoute('/app/invitations')({ component: InvitationsPage })
const STATUS_LABELS = {
  accepted: 'siteInvites.status.accepted',
  expired: 'siteInvites.status.expired',
  pending: 'siteInvites.status.pending',
  revoked: 'siteInvites.status.revoked',
} as const

function InvitationsPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const options = siteInvitationsQueryOptions(session.user.id)
  const invitations = useQuery(options)
  const [email, setEmail] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const invite = useMutation({
    mutationFn: inviteToSite,
    onSuccess: async () => {
      setEmail('')
      setSent(true)
      await queryClient.invalidateQueries({ queryKey: options.queryKey })
    },
  })
  const revoke = useMutation({
    mutationFn: revokeSiteInvitation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: options.queryKey })
    },
  })
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSent(false)
    const parsed = siteInvitationRequestSchema.safeParse({ email })
    setValidation(parsed.success ? null : t('siteInvites.invalidEmail'))
    if (parsed.success) invite.mutate(parsed.data.email)
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('siteInvites.heading')}</h1>
        <p className="mt-2 text-ink-muted">{t('siteInvites.description')}</p>
      </header>
      <ReferralInvitation userId={session.user.id} />
      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label={t('siteInvites.email')} error={validation ?? undefined}>
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
              />
            )}
          </Field>
          <p className="text-sm text-ink-muted">{t('siteInvites.privacy')}</p>
          {sent ? <Alert tone="success">{t('siteInvites.sent')}</Alert> : null}
          {invite.isError ? <Alert tone="error">{describeError(invite.error)}</Alert> : null}
          <Button type="submit" isPending={invite.isPending} className="self-start">
            <UserPlus aria-hidden="true" className="size-4" />
            {t('siteInvites.send')}
          </Button>
        </form>
      </Card>
      <section className="flex flex-col gap-3" aria-labelledby="sent-invitations-heading">
        <h2 id="sent-invitations-heading" className="text-xl font-semibold">
          {t('siteInvites.sentHeading')}
        </h2>
        {invitations.isPending ? <p role="status">{t('siteInvites.loading')}</p> : null}
        {invitations.isError ? (
          <Alert tone="error">{describeError(invitations.error)}</Alert>
        ) : null}
        {revoke.isError ? <Alert tone="error">{describeError(revoke.error)}</Alert> : null}
        {invitations.data?.invitations.length === 0 ? (
          <p className="text-ink-muted">{t('siteInvites.empty')}</p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {invitations.data?.invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-4"
            >
              <div className="min-w-0">
                <p className="font-medium break-all">{invitation.email}</p>
                <p className="text-sm text-ink-muted">
                  {t(STATUS_LABELS[invitation.status])} ·{' '}
                  {dateTimeFormatter.format(new Date(invitation.expiresAt))}
                </p>
              </div>
              {invitation.status === 'pending' ? (
                <Button
                  variant="secondary"
                  disabled={revoke.isPending}
                  onClick={() => {
                    revoke.mutate(invitation.id)
                  }}
                  aria-label={t('siteInvites.revokeEmail', { email: invitation.email })}
                >
                  {t('siteInvites.revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
