import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, LockKeyhole, Mail, UserPlus, X } from 'lucide-react'
import { type SubmitEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Avatar } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Field } from './ui/field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Switch } from './ui/switch'
import type { ShellOrganization } from '../../shared/shell-cache'
import {
  workspaceAccessSchema,
  workspaceGrantRequestSchema,
  workspaceGrantRoleSchema,
  workspaceLinkCreatedSchema,
  type WorkspaceAccessData,
  type WorkspaceGrantRole,
  type WorkspaceLinkDto,
} from '../../shared/workspace-access'
import { apiRequest, fetchJson } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { dateTimeFormatter } from '../lib/format-date'
import { captureOfflineOwner } from '../lib/offline-context'
import { ORGANIZATION_QUERY_KEY } from '../lib/queries'

const ROLE_LABEL_KEYS = {
  owner: 'workspaceAccess.owner',
  admin: 'workspaceAccess.admin',
  editor: 'workspaceAccess.edit',
  viewer: 'workspaceAccess.view',
} as const

const accessQueryKey = (userId: string, organizationId: string) =>
  ['workspace-access', userId, organizationId] as const
const accessPath = (organizationId: string) =>
  `/api/orgs/${encodeURIComponent(organizationId)}/access`
const jsonBody = (method: 'POST' | 'PATCH', value: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})

function captureAccessAccount(userId: string) {
  const account = captureOfflineOwner()
  if (account.userId !== userId) throw new Error('The signed-in account changed.')
  return account
}

/** Shared current-workspace access controls; authority is always checked again by the server. */
export function WorkspaceAccess({
  organization,
  userId,
  isCompact = false,
}: {
  organization: ShellOrganization
  userId: string
  isCompact?: boolean
}) {
  const { t } = useTranslation()
  const headingId = useId()
  const account = useMemo(() => captureAccessAccount(userId), [userId])
  const access = useQuery({
    queryKey: accessQueryKey(userId, organization.id),
    queryFn: async () => {
      account.assertCurrent()
      if (account.userId !== userId) throw new Error('The signed-in account changed.')
      const result = await fetchJson(accessPath(organization.id), workspaceAccessSchema)
      account.assertCurrent()
      return result
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
  })
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {isCompact ? null : (
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{t('shell.manageAccess')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{organization.name}</p>
        </header>
      )}
      {access.error === null ? null : <Alert tone="error">{describeError(access.error)}</Alert>}
      {access.isPending ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('workspaceAccess.loading')}
        </p>
      ) : null}
      {access.data === undefined ? null : (
        <>
          {access.data.isOwner ? (
            <InviteForm organizationId={organization.id} userId={userId} />
          ) : (
            <p className="text-sm text-ink-muted">{t('workspaceAccess.ownerOnly')}</p>
          )}
          <section aria-labelledby={headingId}>
            <h2 id={headingId} className="mb-2 text-base font-semibold">
              {t('workspaceAccess.people')}
            </h2>
            <ul className="divide-y divide-line">
              {access.data.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isOwner={access.data.isOwner}
                  organizationId={organization.id}
                  userId={userId}
                />
              ))}
            </ul>
          </section>
          {access.data.isOwner ? (
            <LegacyInvitations organization={organization} userId={userId} />
          ) : null}
          <section className="border-t border-line pt-4" aria-label={t('workspaceAccess.general')}>
            <div className="flex items-start gap-3">
              <LockKeyhole aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-muted" />
              <div>
                <h2 className="font-semibold">{t('workspaceAccess.restricted')}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t('workspaceAccess.restrictedHint')}</p>
              </div>
            </div>
            {access.data.isOwner ? (
              <LinkControls
                organizationId={organization.id}
                userId={userId}
                links={access.data.links}
              />
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

function LegacyInvitations({
  organization,
  userId,
}: {
  organization: ShellOrganization
  userId: string
}) {
  const { t } = useTranslation()
  const cancel = useAccessMutation(organization.id, userId, async (invitationId: string) => {
    const result = await authClient.organization.cancelInvitation({ invitationId })
    const failure = describeAuthError(result.error)
    if (failure !== null) throw new Error(failure)
  })
  const invitations = organization.invitations.filter((entry) => entry.status === 'pending')
  if (invitations.length === 0) return null
  return (
    <section aria-label={t('members.pendingInvitations')}>
      <h2 className="text-sm font-semibold">{t('members.pendingInvitations')}</h2>
      <ul className="divide-y divide-line">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-2 py-2">
            <p className="min-w-0 flex-1 truncate text-sm">{invitation.email}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancel.mutate(invitation.id)}
              isPending={cancel.isPending && cancel.variables === invitation.id}
              aria-label={t('members.cancelInvitation', { email: invitation.email })}
            >
              {t('workspaceAccess.revoke')}
            </Button>
          </li>
        ))}
      </ul>
      {cancel.error === null ? null : <Alert tone="error">{describeError(cancel.error)}</Alert>}
    </section>
  )
}

function useAccessMutation<T>(
  organizationId: string,
  userId: string,
  action: (input: T) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  const account = useMemo(() => captureAccessAccount(userId), [userId])
  return useMutation({
    mutationFn: async (input: T) => {
      account.assertCurrent()
      if (account.userId !== userId) throw new Error('The signed-in account changed.')
      const result = await action(input)
      account.assertCurrent()
      return result
    },
    networkMode: 'always',
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accessQueryKey(userId, organizationId) }),
        queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEY }),
      ])
    },
  })
}

function useRoleOptions() {
  const { t } = useTranslation()
  return [
    { value: 'viewer' as const, label: t('workspaceAccess.view') },
    { value: 'editor' as const, label: t('workspaceAccess.edit') },
  ]
}

function InviteForm({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { t } = useTranslation()
  const options = useRoleOptions()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceGrantRole>('viewer')
  const [notify, setNotify] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const send = useAccessMutation(
    organizationId,
    userId,
    async (input: { email: string; role: WorkspaceGrantRole; notify: boolean }) => {
      await apiRequest(`${accessPath(organizationId)}/members`, jsonBody('POST', input))
      setEmail('')
      setNotice(t(input.notify ? 'workspaceAccess.sent' : 'workspaceAccess.added'))
    },
  )
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = workspaceGrantRequestSchema.safeParse({ email, role, notify })
    setValidation(parsed.success ? null : t('siteInvites.invalidEmail'))
    setNotice(null)
    if (parsed.success) send.mutate(parsed.data)
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field
          className="min-w-40 flex-1"
          label={t('workspaceAccess.addPeople')}
          error={validation ?? undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              placeholder={t('members.emailLabel')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('workspaceAccess.permission')}>
          {(control) => (
            <Select
              id={control.id}
              value={role}
              options={options}
              onChange={setRole}
              className="min-w-24"
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            isChecked={notify}
            onCheckedChange={setNotify}
            aria-label={t('workspaceAccess.notify')}
          />
          {t('workspaceAccess.notify')}
        </label>
        <Button type="submit" size="sm" isPending={send.isPending}>
          {notify ? (
            <Mail aria-hidden="true" className="size-4" />
          ) : (
            <UserPlus aria-hidden="true" className="size-4" />
          )}
          {t(notify ? 'workspaceAccess.send' : 'workspaceAccess.add')}
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        {t(notify ? 'workspaceAccess.notifyHint' : 'workspaceAccess.silentHint')}
      </p>
      {notice === null ? null : (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      )}
      {send.error === null ? null : <Alert tone="error">{describeError(send.error)}</Alert>}
    </form>
  )
}

function MemberRow({
  member,
  isOwner,
  organizationId,
  userId,
}: {
  member: WorkspaceAccessData['members'][number]
  isOwner: boolean
  organizationId: string
  userId: string
}) {
  const { t } = useTranslation()
  const options = useRoleOptions()
  const change = useAccessMutation(
    organizationId,
    userId,
    async (role: WorkspaceGrantRole) =>
      await apiRequest(
        `${accessPath(organizationId)}/members/${member.id}`,
        jsonBody('PATCH', { role }),
      ),
  )
  const remove = useAccessMutation(
    organizationId,
    userId,
    async () =>
      await apiRequest(`${accessPath(organizationId)}/members/${member.id}`, { method: 'DELETE' }),
  )
  const error = change.error ?? remove.error
  const canEdit = isOwner && member.role !== 'owner'
  const roleLabel = t(ROLE_LABEL_KEYS[member.role])
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar name={member.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {member.userId === userId ? <span> {t('members.you')}</span> : null}
        </p>
        <p className="truncate text-xs text-ink-muted">{member.email}</p>
      </div>
      {canEdit ? (
        <div className="ms-auto flex items-center gap-1">
          <Select
            aria-label={t('members.roleFor', { name: member.name })}
            value={member.role}
            options={
              member.role === 'admin' ? [{ value: 'admin', label: roleLabel }, ...options] : options
            }
            disabled={change.isPending || remove.isPending}
            onChange={(value) => {
              const parsed = workspaceGrantRoleSchema.safeParse(value)
              if (parsed.success) change.mutate(parsed.data)
            }}
            className="min-w-24"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('workspaceAccess.removeFor', { name: member.name })}
            isPending={remove.isPending}
            disabled={change.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : (
        <Badge>{roleLabel}</Badge>
      )}
      {error === null ? null : (
        <p role="alert" className="w-full text-sm text-rose-600 dark:text-rose-400">
          {describeError(error)}
        </p>
      )}
    </li>
  )
}

function LinkControls({
  organizationId,
  userId,
  links,
}: {
  organizationId: string
  userId: string
  links: WorkspaceLinkDto[]
}) {
  const { t } = useTranslation()
  const options = useRoleOptions()
  const [role, setRole] = useState<WorkspaceGrantRole>('viewer')
  const [days, setDays] = useState<'1' | '7' | '30'>('7')
  const [url, setUrl] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const create = useAccessMutation(organizationId, userId, async () => {
    const result = await fetchJson(
      `${accessPath(organizationId)}/links`,
      workspaceLinkCreatedSchema,
      jsonBody('POST', { role, days: Number(days) }),
    )
    setUrl(result.url)
    setCopyNotice(null)
  })
  const revoke = useAccessMutation(organizationId, userId, async (id: string) => {
    await apiRequest(`${accessPath(organizationId)}/links/${id}`, { method: 'DELETE' })
    setUrl(null)
  })
  const error = create.error ?? revoke.error
  const pending = links.filter((link) => link.status === 'pending')
  async function copy() {
    if (url === null) return
    try {
      await navigator.clipboard.writeText(url)
      setCopyNotice(t('workspaceAccess.copied'))
    } catch {
      setCopyNotice(t('workspaceAccess.copyFailed'))
    }
  }
  return (
    <div className="mt-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('workspaceAccess.inviteLink')}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t('workspaceAccess.linkPermission')}
          value={role}
          options={options}
          onChange={setRole}
          className="min-w-24 flex-1"
        />
        <Select
          aria-label={t('workspaceAccess.expires')}
          value={days}
          options={(['1', '7', '30'] as const).map((value) => ({
            value,
            label: t('workspaceAccess.days', { count: Number(value) }),
          }))}
          onChange={setDays}
          className="min-w-24 flex-1"
        />
        <Button
          variant="secondary"
          size="sm"
          isPending={create.isPending}
          onClick={() => create.mutate(undefined)}
        >
          <Link2 aria-hidden="true" className="size-4" />
          {t('workspaceAccess.createLink')}
        </Button>
      </div>
      <p className="text-xs text-ink-muted">{t('workspaceAccess.linkHint')}</p>
      {url === null ? null : (
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('workspaceAccess.inviteLink')}
            value={url}
            readOnly
            className="min-w-0 flex-1"
            onFocus={(event) => event.target.select()}
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void copy()}
            aria-label={t('workspaceAccess.copyLink')}
          >
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
      {copyNotice === null ? null : (
        <p role="status" className="text-xs text-ink-muted">
          {copyNotice}
        </p>
      )}
      {error === null ? null : <Alert tone="error">{describeError(error)}</Alert>}
      {pending.length === 0 ? null : (
        <ul className="divide-y divide-line">
          {pending.map((link) => (
            <li key={link.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{link.email ?? t('workspaceAccess.inviteLink')}</p>
                <p className="text-xs text-ink-muted">
                  {t(link.role === 'editor' ? 'workspaceAccess.edit' : 'workspaceAccess.view')} ·{' '}
                  {dateTimeFormatter.format(new Date(link.expiresAt))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                isPending={revoke.isPending && revoke.variables === link.id}
                onClick={() => revoke.mutate(link.id)}
                aria-label={t('workspaceAccess.revokeFor', {
                  name: link.email ?? t('workspaceAccess.inviteLink'),
                })}
              >
                {t('workspaceAccess.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
