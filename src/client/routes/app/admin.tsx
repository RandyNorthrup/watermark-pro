import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { Ban, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { AlertDialog, Tabs } from 'radix-ui'
import { useDeferredValue, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AuditTable } from '../../components/audit-table'
import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import {
  ADMIN_QUERY_KEY,
  adminAuditQueryOptions,
  adminOrganizationsQueryOptions,
  type AdminUser,
  adminUsersQueryOptions,
  banUser,
  isPlatformAdmin,
  revokeUserSessions,
  setUserRole,
  unbanUser,
} from '../../lib/admin'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { dateTimeFormatter } from '../../lib/format-date'

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
})

const tabClassName =
  'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:bg-brand-600 data-[state=active]:text-white'

function AdminPage() {
  const { t } = useTranslation()
  const { session } = Route.useRouteContext()
  const isAdmin = isPlatformAdmin(session.user)
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('admin.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('admin.description')}</p>
      </header>
      {isAdmin ? (
        <AdminSections selfId={session.user.id} />
      ) : (
        <Alert tone="error">{t('admin.onlyAdmins')}</Alert>
      )}
    </div>
  )
}

function AdminSections({ selfId }: { selfId: string }) {
  const { t } = useTranslation()
  return (
    <Tabs.Root defaultValue="users" className="flex flex-col gap-4">
      <Tabs.List
        aria-label={t('admin.sectionsLabel')}
        className="inline-flex self-start rounded-lg border border-line bg-surface-raised p-1"
      >
        <Tabs.Trigger value="users" className={tabClassName}>
          {t('admin.tabs.users')}
        </Tabs.Trigger>
        <Tabs.Trigger value="organizations" className={tabClassName}>
          {t('admin.tabs.organizations')}
        </Tabs.Trigger>
        <Tabs.Trigger value="audit" className={tabClassName}>
          {t('admin.tabs.audit')}
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="users" className="outline-none">
        <UsersPanel selfId={selfId} />
      </Tabs.Content>
      <Tabs.Content value="organizations" className="outline-none">
        <OrganizationsPanel />
      </Tabs.Content>
      <Tabs.Content value="audit" className="outline-none">
        <AuditPanel />
      </Tabs.Content>
    </Tabs.Root>
  )
}

function UsersPanel({ selfId }: { selfId: string }) {
  const { t } = useTranslation()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const users = useQuery(adminUsersQueryOptions(deferredSearch))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          {t('admin.searchLabel')}
        </label>
        <Input
          id={searchId}
          type="search"
          value={search}
          placeholder={t('admin.searchPlaceholder')}
          onChange={(event) => {
            setSearch(event.currentTarget.value)
          }}
        />
      </div>
      {users.isPending ? <Spinner className="size-6" label={t('admin.loadingUsers')} /> : null}
      {users.isError ? (
        <Alert tone="error" title={t('admin.usersErrorTitle')}>
          {describeError(users.error)}
        </Alert>
      ) : null}
      {users.isSuccess ? (
        <>
          <p className="text-sm text-ink-muted">
            {t('admin.userSummary', {
              count: users.data.total,
              extra:
                users.data.total > users.data.users.length
                  ? t('admin.showingNewest', { count: users.data.users.length })
                  : '',
            })}
          </p>
          <ul className="flex flex-col gap-2">
            {users.data.users.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === selfId} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function banLabel(t: TFunction, user: AdminUser): string {
  const reason = user.banReason ?? ''
  return reason === '' ? t('admin.banned') : t('admin.bannedReason', { reason })
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const isAdmin = isPlatformAdmin(user)
  const isBanned = user.banned === true
  const act = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })
    },
    onError: (failure) => {
      setError(describeError(failure))
    },
  })
  return (
    <li>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {user.name}
              {isSelf ? <span className="text-ink-muted"> {t('admin.you')}</span> : null}
            </p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            <p className="text-xs text-ink-muted">
              {t('admin.joined', { date: dateTimeFormatter.format(user.createdAt) })}
              {user.emailVerified ? '' : t('admin.emailNotVerified')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? <Badge>{t('admin.platformAdmin')}</Badge> : null}
            {isBanned ? (
              <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">
                {banLabel(t, user)}
              </Badge>
            ) : null}
          </div>
        </div>
        {isSelf ? null : (
          <div className="flex flex-wrap gap-2">
            {isBanned ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isPending={act.isPending}
                aria-label={t('admin.unbanUser', { email: user.email })}
                onClick={() => {
                  act.mutate(() => unbanUser(user.id))
                }}
              >
                <UserCheck aria-hidden="true" className="size-4" />
                {t('admin.unban')}
              </Button>
            ) : (
              <BanDialog
                email={user.email}
                isPending={act.isPending}
                onConfirm={(reason) => {
                  act.mutate(() => banUser(user.id, reason))
                }}
              />
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isPending={act.isPending}
              aria-label={t(isAdmin ? 'admin.removeAdminFrom' : 'admin.makeAdmin', {
                email: user.email,
              })}
              onClick={() => {
                act.mutate(() => setUserRole(user.id, isAdmin ? 'user' : 'admin'))
              }}
            >
              {isAdmin ? (
                <ShieldOff aria-hidden="true" className="size-4" />
              ) : (
                <ShieldCheck aria-hidden="true" className="size-4" />
              )}
              {t(isAdmin ? 'admin.removeAdmin' : 'admin.makeAdminShort')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isPending={act.isPending}
              aria-label={t('admin.signOutEverywhere', { email: user.email })}
              onClick={() => {
                act.mutate(() => revokeUserSessions(user.id))
              }}
            >
              <UserX aria-hidden="true" className="size-4" />
              {t('admin.signOutEverywhereButton')}
            </Button>
          </div>
        )}
        {error === null ? null : <Alert tone="error">{error}</Alert>}
      </Card>
    </li>
  )
}

function BanDialog({
  email,
  isPending,
  onConfirm,
}: {
  email: string
  isPending: boolean
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button
          type="button"
          variant="danger"
          size="sm"
          isPending={isPending}
          aria-label={t('admin.banUser', { email })}
        >
          <Ban aria-hidden="true" className="size-4" />
          {t('admin.ban')}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <AlertDialog.Content
          // physical: geometry: the ban-confirm dialog is centred — left-1/2 pairs with -translate-x-1/2
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card"
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {t('admin.banConfirmTitle', { email })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-ink-muted">
            {t('admin.banConfirmBody')}
          </AlertDialog.Description>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {t('admin.reasonLabel')}
            </label>
            <Input
              id={reasonId}
              value={reason}
              maxLength={200}
              onChange={(event) => {
                setReason(event.currentTarget.value)
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary">
                {t('admin.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant="danger"
                disabled={reason.trim() === ''}
                onClick={() => {
                  onConfirm(reason.trim())
                }}
              >
                {t('admin.banConfirm')}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

function OrganizationsPanel() {
  const { t } = useTranslation()
  const organizations = useQuery(adminOrganizationsQueryOptions)
  if (organizations.isPending) {
    return <Spinner className="size-6" label={t('admin.loadingOrganizations')} />
  }
  if (organizations.isError) {
    return (
      <Alert tone="error" title={t('admin.organizationsErrorTitle')}>
        {describeError(organizations.error)}
      </Alert>
    )
  }
  return (
    <Card
      className="overflow-x-auto p-0 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      tabIndex={0}
      role="region"
      aria-label={t('admin.organizationsTable')}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{t('admin.organizationsTable')}</caption>
        <thead className="text-start text-xs text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t('admin.th.organization')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('admin.th.members')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('admin.th.photos')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('admin.th.storage')}
            </th>
            <th scope="col" className="px-4 py-3">
              {t('admin.th.created')}
            </th>
          </tr>
        </thead>
        <tbody>
          {organizations.data.map((organization) => (
            <tr key={organization.id} className="border-t border-line">
              <td className="px-4 py-3">
                <span className="font-medium">{organization.name}</span>
                {organization.slug === null ? null : (
                  <span className="ms-2 text-xs text-ink-muted">{organization.slug}</span>
                )}
              </td>
              <td className="px-4 py-3">{String(organization.memberCount)}</td>
              <td className="px-4 py-3">{String(organization.photoCount)}</td>
              <td className="px-4 py-3">{formatBytes(organization.storageBytes)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {dateTimeFormatter.format(new Date(organization.createdAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function AuditPanel() {
  const { t } = useTranslation()
  const entries = useQuery(adminAuditQueryOptions)
  if (entries.isPending) {
    return <Spinner className="size-6" label={t('admin.loadingAudit')} />
  }
  if (entries.isError) {
    return (
      <Alert tone="error" title={t('admin.auditErrorTitle')}>
        {describeError(entries.error)}
      </Alert>
    )
  }
  return (
    <AuditTable
      caption={t('admin.auditCaption')}
      entries={entries.data}
      detailHeading={t('admin.auditDetailHeading')}
      renderDetail={(entry) => (
        <td className="px-4 py-3 font-mono text-xs text-ink-muted">
          {entry.organizationId ?? t('admin.platform')}
        </td>
      )}
    />
  )
}
