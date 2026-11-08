import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { WorkspaceOfflineNote, WorkspaceTrigger } from './shell-triggers'
import { useFirstItemHandOff } from './ui/deferred-overlay'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { type ActiveOrganization, authClient } from '../lib/auth-client'
import { cn } from '../lib/cn'
import { describeError } from '../lib/errors'
import { captureOfflineOwner } from '../lib/offline-context'
import { offlineStatus, subscribeOfflineStatus } from '../lib/offline-status'
import { resetShellQueries } from '../lib/queries'

/**
 * The workspace switcher's menu, loaded by the app shell the first time
 * someone reaches for the workspace button and mounted already open.
 */
export function OrganizationSwitcherMenu({
  organization,
  organizations,
  home,
  isKeyboardOpen,
}: {
  organization: ActiveOrganization | null
  organizations: readonly { id: string; name: string }[]
  home: '/app' | '/app/editor'
  isKeyboardOpen: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isOnline } = useSyncExternalStore(subscribeOfflineStatus, offlineStatus)
  const handOffFocus = useFirstItemHandOff(isKeyboardOpen)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)

  async function switchTo(organizationId: string) {
    setSwitchError(null)
    setIsSwitching(true)
    let owner: ReturnType<typeof captureOfflineOwner> | undefined
    try {
      owner = captureOfflineOwner()
      const result = await authClient.organization.setActive({ organizationId })
      owner.assertCurrent()
      if (result.error !== null) {
        setSwitchError(result.error.message ?? t('offline.connectionRequired'))
        return
      }
      // Switching changes shell membership context, not every active media query.
      resetShellQueries(queryClient)
      await router.invalidate()
      owner.assertCurrent()
      await navigate({ to: home })
    } catch (error) {
      try {
        owner?.assertCurrent()
      } catch {
        return
      }
      setSwitchError(describeError(error))
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <WorkspaceTrigger
            organizationName={organization?.name ?? null}
            disabled={!isOnline || isSwitching}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" onFocus={handOffFocus}>
          <DropdownMenuLabel>{t('shell.organizations')}</DropdownMenuLabel>
          {organizations.map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              className={cn(candidate.id === organization?.id && 'font-semibold')}
              onSelect={() => void switchTo(candidate.id)}
            >
              {candidate.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigate({ to: '/app/organizations/new' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('shell.newOrganization')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceOfflineNote isOnline={isOnline} />
      {switchError === null ? null : (
        <p role="alert" className="text-danger mt-2 text-xs">
          {switchError}
        </p>
      )}
    </div>
  )
}
