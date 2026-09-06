import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import type { z } from 'zod'

import {
  ASSIGNABLE_ROLES,
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
import {
  authClient,
  type OrganizationInvitation,
  type OrganizationMember,
} from '../../lib/auth-client'
import { describeAuthError } from '../../lib/errors'
import {
  activeMemberRoleQueryOptions,
  activeOrganizationQueryOptions,
  ORGANIZATION_QUERY_KEY,
} from '../../lib/queries'
import { canRole } from '../../lib/roles'
import { useAuthMutation } from '../../lib/use-auth-mutation'
import { useFormErrors } from '../../lib/use-form-errors'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/members')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: MembersPage,
})

const ROLE_OPTIONS: readonly SelectOption<AssignableRole>[] = ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: role.charAt(0).toUpperCase() + role.slice(1),
}))

type InviteValues = z.infer<typeof inviteMemberSchema>

function MembersPage() {
  const { session } = Route.useRouteContext()
  const membership = Route.useLoaderData()
  const initialOrganization = appRoute.useLoaderData()
  const { data: organization } = useQuery({
    ...activeOrganizationQueryOptions,
    initialData: initialOrganization,
  })
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to manage members.</Alert>
  }

  const isManager = canRole(membership?.role, { member: ['update'] })
  const pendingInvitations = organization.invitations.filter(
    (invitation) => invitation.status === 'pending',
  )

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-ink-muted">
          People in {organization.name} and what they can do.
        </p>
      </header>

      {isManager ? <InviteForm organizationId={organization.id} /> : null}

      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="text-xl font-semibold tracking-tight">
          {String(organization.members.length)} member{organization.members.length === 1 ? '' : 's'}
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
            Pending invitations
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
      setNotice({ tone: 'success', text: `Invitation sent to ${input.email}.` })
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
        <h2 className="text-lg font-semibold">Invite someone</h2>
        {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Field label="Email" error={errors.email} className="flex-1">
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
          <Field label="Role" error={errors.role}>
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
            Send invitation
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
            {isSelf ? <span className="font-normal text-ink-muted"> (you)</span> : null}
          </p>
          <p className="truncate text-sm text-ink-muted">{member.user.email}</p>
          <RowError message={error} />
        </div>
        {editableRole === null ? (
          <Badge>{member.role}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              aria-label={`Role for ${member.user.name}`}
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
              aria-label={`Remove ${member.user.name}`}
            >
              Remove
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
  const cancel = useAuthMutation(() =>
    authClient.organization.cancelInvitation({ invitationId: invitation.id }),
  )

  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{invitation.email}</p>
          <p className="text-sm text-ink-muted">
            Invited as <Badge>{invitation.role}</Badge>
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
            aria-label={`Cancel invitation for ${invitation.email}`}
          >
            Cancel
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
