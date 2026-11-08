import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { CircleUserRound, LogOut, ScrollText, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AccountTrigger } from './shell-triggers'
import { useFirstItemHandOff } from './ui/deferred-overlay'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { type ActiveOrganization, authClient, type SessionData } from '../lib/auth-client'
import { clearOfflineAccount } from '../lib/offline-account'
import { currentOfflineUser, hasOfflineDatabase } from '../lib/offline-context'
import { isPlatformAdmin } from '../lib/platform-admin'

const WorkspaceAccessDialog = lazy(async () => {
  const module = await import('./workspace-access-dialog')
  return { default: module.WorkspaceAccessDialog }
})

/**
 * The account menu, loaded by the app shell the first time someone reaches
 * for the account button and mounted already open.
 */
export function UserMenuDropdown({
  session,
  organization,
  isKeyboardOpen,
}: {
  session: SessionData
  organization: ActiveOrganization | null
  isKeyboardOpen: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const handOffFocus = useFirstItemHandOff(isKeyboardOpen)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [isAccessOpen, setIsAccessOpen] = useState(false)

  async function signOut() {
    const exitingUserId = session.user.id
    setSignOutError(null)
    if (hasOfflineDatabase()) {
      const { pendingOperations } = await import('../lib/offline-database')
      const pending = await pendingOperations(exitingUserId)
      if (pending.length > 0) {
        setSignOutError(t('offline.signOutPending'))
        return
      }
    }
    const result = await authClient.signOut()
    if (result.error !== null) {
      setSignOutError(result.error.message ?? t('offline.signOutFailed'))
      return
    }
    await clearOfflineAccount(queryClient, exitingUserId)
    // The session observer may already have left the app while device cleanup
    // awaited IndexedDB. Do not interrupt a new login/signup from that old task.
    const path = router.state.location.pathname
    if (currentOfflineUser() === null && (path === '/app' || path.startsWith('/app/'))) {
      await navigate({ to: '/login' })
    }
  }

  return (
    <>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <AccountTrigger name={session.user.name} image={session.user.image} />
        </DropdownMenuTrigger>
        <DropdownMenuContent onFocus={handOffFocus}>
          <DropdownMenuLabel>
            <span className="block font-medium text-ink">{session.user.name}</span>
            <span className="block truncate">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/account' })}>
            <CircleUserRound aria-hidden="true" className="size-4" />
            {t('accountAuth.heading')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/invitations' })}>
            <UserPlus aria-hidden="true" className="size-4" />
            {t('siteInvites.heading')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {organization === null ? null : (
            <DropdownMenuLabel>{organization.name}</DropdownMenuLabel>
          )}
          <DropdownMenuItem
            data-guidance-topic="workspace"
            disabled={organization === null}
            onSelect={() => setIsAccessOpen(true)}
          >
            <Users aria-hidden="true" className="size-4" />
            {t('shell.manageAccess')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/audit' })}>
            <ScrollText aria-hidden="true" className="size-4" />
            {t('shell.nav.audit')}
          </DropdownMenuItem>
          {isPlatformAdmin(session.user) ? (
            <DropdownMenuItem onSelect={() => void navigate({ to: '/app/admin' })}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              {t('shell.nav.admin')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {signOutError === null ? null : (
            <p
              role="alert"
              className="max-w-xs px-2 py-2 text-sm whitespace-normal text-rose-700 dark:text-rose-300"
            >
              {signOutError}
            </p>
          )}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void signOut()
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {t('shell.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isAccessOpen && organization !== null ? (
        <Suspense fallback={null}>
          <WorkspaceAccessDialog
            organization={organization}
            userId={session.user.id}
            onClose={() => setIsAccessOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  )
}
