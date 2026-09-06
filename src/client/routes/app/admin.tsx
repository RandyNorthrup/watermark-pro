import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { AlertDialog, Tabs } from 'radix-ui'
import { useDeferredValue, useId, useState } from 'react'

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
  const { session } = Route.useRouteContext()
  const isAdmin = isPlatformAdmin(session.user)
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every user and organization on this deployment. Actions here are recorded in the audit
          trail.
        </p>
      </header>
      {isAdmin ? (
        <AdminSections selfId={session.user.id} />
      ) : (
        <Alert tone="error">Only platform administrators can open this page.</Alert>
      )}
    </div>
  )
}

function AdminSections({ selfId }: { selfId: string }) {
  return (
    <Tabs.Root defaultValue="users" className="flex flex-col gap-4">
      <Tabs.List
        aria-label="Administration sections"
        className="inline-flex self-start rounded-lg border border-line bg-surface-raised p-1"
      >
        <Tabs.Trigger value="users" className={tabClassName}>
          Users
        </Tabs.Trigger>
        <Tabs.Trigger value="organizations" className={tabClassName}>
          Organizations
        </Tabs.Trigger>
        <Tabs.Trigger value="audit" className={tabClassName}>
          Audit trail
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
  const searchId = useId()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const users = useQuery(adminUsersQueryOptions(deferredSearch))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          Search by email
        </label>
        <Input
          id={searchId}
          type="search"
          value={search}
          placeholder="name@example.com"
          onChange={(event) => {
            setSearch(event.currentTarget.value)
          }}
        />
      </div>
      {users.isPending ? <Spinner className="size-6" label="Loading users" /> : null}
      {users.isError ? (
        <Alert tone="error" title="Could not load users">
          {describeError(users.error)}
        </Alert>
      ) : null}
      {users.isSuccess ? (
        <>
          <p className="text-sm text-ink-muted">
            {String(users.data.total)} user{users.data.total === 1 ? '' : 's'}
            {users.data.total > users.data.users.length
              ? `, showing the newest ${String(users.data.users.length)}`
              : ''}
            .
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

function banLabel(user: AdminUser): string {
  const reason = user.banReason ?? ''
  return reason === '' ? 'banned' : `banned: ${reason}`
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
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
              {isSelf ? <span className="text-ink-muted"> (you)</span> : null}
            </p>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            <p className="text-xs text-ink-muted">
              Joined {dateTimeFormatter.format(user.createdAt)}
              {user.emailVerified ? '' : ' · email not verified'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? <Badge>platform admin</Badge> : null}
            {isBanned ? (
              <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">
                {banLabel(user)}
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
                aria-label={`Unban ${user.email}`}
                onClick={() => {
                  act.mutate(() => unbanUser(user.id))
                }}
              >
                <UserCheck aria-hidden="true" className="size-4" />
                Unban
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
              aria-label={
                isAdmin ? `Remove admin from ${user.email}` : `Make ${user.email} an admin`
              }
              onClick={() => {
                act.mutate(() => setUserRole(user.id, isAdmin ? 'user' : 'admin'))
              }}
            >
              {isAdmin ? (
                <ShieldOff aria-hidden="true" className="size-4" />
              ) : (
                <ShieldCheck aria-hidden="true" className="size-4" />
              )}
              {isAdmin ? 'Remove admin' : 'Make admin'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isPending={act.isPending}
              aria-label={`Sign out ${user.email} everywhere`}
              onClick={() => {
                act.mutate(() => revokeUserSessions(user.id))
              }}
            >
              <UserX aria-hidden="true" className="size-4" />
              Sign out everywhere
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
          aria-label={`Ban ${email}`}
        >
          <Ban aria-hidden="true" className="size-4" />
          Ban
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card">
          <AlertDialog.Title className="text-lg font-semibold">Ban {email}?</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-ink-muted">
            Their sessions end now and they cannot sign in until unbanned. The reason is shown to
            them and kept in the audit trail.
          </AlertDialog.Description>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium">
              Reason
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
                Cancel
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
                Ban user
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

function OrganizationsPanel() {
  const organizations = useQuery(adminOrganizationsQueryOptions)
  if (organizations.isPending) {
    return <Spinner className="size-6" label="Loading organizations" />
  }
  if (organizations.isError) {
    return (
      <Alert tone="error" title="Could not load organizations">
        {describeError(organizations.error)}
      </Alert>
    )
  }
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <caption className="sr-only">Organizations, newest first</caption>
        <thead className="text-left text-xs text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              Organization
            </th>
            <th scope="col" className="px-4 py-3">
              Members
            </th>
            <th scope="col" className="px-4 py-3">
              Photos
            </th>
            <th scope="col" className="px-4 py-3">
              Storage
            </th>
            <th scope="col" className="px-4 py-3">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {organizations.data.map((organization) => (
            <tr key={organization.id} className="border-t border-line">
              <td className="px-4 py-3">
                <span className="font-medium">{organization.name}</span>
                {organization.slug === null ? null : (
                  <span className="ml-2 text-xs text-ink-muted">{organization.slug}</span>
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
  const entries = useQuery(adminAuditQueryOptions)
  if (entries.isPending) {
    return <Spinner className="size-6" label="Loading audit trail" />
  }
  if (entries.isError) {
    return (
      <Alert tone="error" title="Could not load the audit trail">
        {describeError(entries.error)}
      </Alert>
    )
  }
  return (
    <AuditTable
      caption="Audit entries across all organizations, newest first"
      entries={entries.data}
      detailHeading="Organization"
      renderDetail={(entry) => (
        <td className="px-4 py-3 font-mono text-xs text-ink-muted">
          {entry.organizationId ?? 'platform'}
        </td>
      )}
    />
  )
}
