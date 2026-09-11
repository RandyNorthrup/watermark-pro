import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'

import { ASSIGNABLE_ROLES } from '../../../shared/constants'
import {
  type AssignableRole,
  isOrganizationRole,
  type OrganizationRole,
} from '../../../shared/permissions'
import { inviteMemberSchema } from '../../../shared/validation'
import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Select, type SelectOption } from '../../components/ui/select'
import { useActiveOrganization } from '../../lib/active-organization'
import {
  authClient,
  type OrganizationInvitation,
  type OrganizationMember,
} from '../../lib/auth-client'
import { describeAuthError } from '../../lib/errors'
import { readActiveMemberRole, ORGANIZATION_QUERY_KEY } from '../../lib/queries'
import { canRole } from '../../lib/roles'
import { useAuthMutation } from '../../lib/use-auth-mutation'
import { useFormErrors } from '../../lib/use-form-errors'

export const Route = createFileRoute('/app/members')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: MembersPage,
})

const ROLE_OPTIONS: readonly SelectOption<AssignableRole>[] = ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: role.charAt(0).toUpperCase() + role.slice(1),
}))

type InviteValues = z.infer<typeof inviteMemberSchema>

function MembersPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const membership = Route.useLoaderData()
  const organization = useActiveOrganization()
  if (organization === null) {
    return <Alert tone="info">{t('members.orgRequired')}</Alert>
  }

  if (organization.id === `personal-${session.user.id}`) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">{t('siteInvites.privateHeading')}</h1>
        <p className="text-ink-muted">{t('siteInvites.privateBody')}</p>
        <Link
          className="min-h-11 py-3 text-brand-700 underline dark:text-brand-300"
          to="/app/invitations"
        >
          {t('siteInvites.heading')}
        </Link>
        <Link
          className="min-h-11 py-3 text-brand-700 underline dark:text-brand-300"
          to="/app/organizations/new"
        >
          {t('siteInvites.collaborate')}
        </Link>
      </div>
    )
  }

  const isManager = canRole(membership?.role, { member: ['update'] })
  const pendingInvitations = organization.invitations.filter(
    (invitation) => invitation.status === 'pending',
  )

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('members.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('members.description', { name: organization.name })}
        </p>
      </header>

      {isManager ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t('siteInvites.collaborationNotice')}</p>
          <InviteForm organizationId={organization.id} />
        </div>
      ) : null}

      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="text-xl font-semibold tracking-tight">
          {t('members.count', { count: organization.members.length })}
        </h2>
        <ul className="flex flex-col gap-2">
          {organization.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              organizationId={organization.id}
              isSelf={member.userId === session.user.id}
              isManager={isManager}
            />
          ))}
        </ul>
      </section>

      {pendingInvitations.length > 0 ? (
        <section aria-labelledby="invitations-heading" className="flex flex-col gap-3">
          <h2 id="invitations-heading" className="text-xl font-semibold tracking-tight">
            {t('members.pendingInvitations')}
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingInvitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} isManager={isManager} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function InviteForm({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<InviteValues>({ email: '', role: 'editor' })
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const { errors, validate } = useFormErrors<InviteValues>()
  const invite = useMutation({
    mutationFn: async (input: InviteValues) => {
      const result = await authClient.organization.inviteMember({
        email: input.email,
        role: input.role,
        organizationId,
      })
      const failure = describeAuthError(result.error)
      if (failure !== null) {
        throw new Error(failure)
      }
    },
    onSuccess: async (_data, input) => {
      setNotice({ tone: 'success', text: t('members.invitationSent', { email: input.email }) })
      setValues({ email: '', role: input.role })
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEY })
    },
    onError: (error) => {
      setNotice({ tone: 'error', text: error.message })
    },
  })

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(inviteMemberSchema, values)
    if (parsed !== null) {
      setNotice(null)
      invite.mutate(parsed)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('members.inviteHeading')}</h2>
        {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Field label={t('members.emailLabel')} error={errors.email} className="flex-1">
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="off"
                value={values.email}
                onChange={(event) => {
                  setValues({ ...values, email: event.target.value })
                }}
              />
            )}
          </Field>
          <Field label={t('members.roleLabel')} error={errors.role}>
            {(control) => (
              <Select
                id={control.id}
                value={values.role}
                options={ROLE_OPTIONS}
                onChange={(role) => {
                  setValues({ ...values, role })
                }}
              />
            )}
          </Field>
          <Button type="submit" isPending={invite.isPending} className="sm:mt-6">
            {t('members.sendInvitation')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

interface MemberRowProps {
  member: OrganizationMember
  organizationId: string
  isSelf: boolean
  isManager: boolean
}

function MemberRow({ member, organizationId, isSelf, isManager }: MemberRowProps) {
  const { t } = useTranslation()
  const currentRole: OrganizationRole = isOrganizationRole(member.role) ? member.role : 'viewer'
  // Owners are not reassignable from this screen; ownership transfer is a separate flow.
  const editableRole: AssignableRole | null =
    isManager && !isSelf && currentRole !== 'owner' ? currentRole : null
  const changeRole = useAuthMutation((role: AssignableRole) =>
    authClient.organization.updateMemberRole({ memberId: member.id, role, organizationId }),
  )
  const remove = useAuthMutation(() =>
    authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId }),
  )
  const error = changeRole.error ?? remove.error

  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Avatar name={member.user.name} image={member.user.image} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {member.user.name}
            {isSelf ? (
              <span className="font-normal text-ink-muted"> {t('members.you')}</span>
            ) : null}
          </p>
          <p className="truncate text-sm text-ink-muted">{member.user.email}</p>
          <RowError message={error} />
        </div>
        {editableRole === null ? (
          <Badge>{member.role}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              aria-label={t('members.roleFor', { name: member.user.name })}
              value={editableRole}
              options={ROLE_OPTIONS}
              disabled={changeRole.mutation.isPending}
              onChange={(role) => {
                changeRole.mutation.mutate(role)
              }}
            />
            <Button
              variant="danger"
              size="sm"
              isPending={remove.mutation.isPending}
              onClick={() => {
                remove.mutation.mutate(undefined)
              }}
              aria-label={t('members.removeMember', { name: member.user.name })}
            >
              {t('members.remove')}
            </Button>
          </div>
        )}
      </Card>
    </li>
  )
}

function InvitationRow({
  invitation,
  isManager,
}: {
  invitation: OrganizationInvitation
  isManager: boolean
}) {
  const { t } = useTranslation()
  const cancel = useAuthMutation(() =>
    authClient.organization.cancelInvitation({ invitationId: invitation.id }),
  )

  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{invitation.email}</p>
          <p className="text-sm text-ink-muted">
            {t('members.invitedAs')} <Badge>{invitation.role}</Badge>
          </p>
          <RowError message={cancel.error} />
        </div>
        {isManager ? (
          <Button
            variant="secondary"
            size="sm"
            isPending={cancel.mutation.isPending}
            onClick={() => {
              cancel.mutation.mutate(undefined)
            }}
            aria-label={t('members.cancelInvitation', { email: invitation.email })}
          >
            {t('members.cancel')}
          </Button>
        ) : null}
      </Card>
    </li>
  )
}

function RowError({ message }: { message: string | null }) {
  if (message === null) {
    return null
  }
  return (
    <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
      {message}
    </p>
  )
}
