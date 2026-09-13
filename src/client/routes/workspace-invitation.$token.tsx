import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import {
  workspaceInvitationAcceptedSchema,
  workspaceInvitationPreviewSchema,
} from '../../shared/workspace-access'
import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { fetchJson } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { ACCOUNT_CHANGED_EVENT } from '../lib/offline-account'
import { captureOfflineOwner, currentOfflineUser } from '../lib/offline-context'
import { resetShellQueries } from '../lib/queries'

function subscribeAccount(listener: () => void) {
  window.addEventListener(ACCOUNT_CHANGED_EVENT, listener)
  return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, listener)
}

export const Route = createFileRoute('/workspace-invitation/$token')({
  beforeLoad: async ({ context, location }) => {
    const { sessionQueryOptions } = await import('../lib/queries')
    const session = await context.queryClient.query({
      ...sessionQueryOptions,
      staleTime: 0,
      retry: false,
    })
    if (session === null) throw redirect({ to: '/login', search: { redirect: location.pathname } })
    const { activateOfflineAccount } = await import('../lib/offline-account')
    await activateOfflineAccount(context.queryClient, session.user.id)
    return { invitationOwner: captureOfflineOwner() }
  },
  loader: async ({ params, context }) => {
    context.invitationOwner.assertCurrent()
    const invitation = await fetchJson(
      `/api/me/workspace-invitations/${encodeURIComponent(params.token)}`,
      workspaceInvitationPreviewSchema,
    )
    context.invitationOwner.assertCurrent()
    return invitation
  },
  component: WorkspaceInvitationPage,
  errorComponent: WorkspaceInvitationUnavailable,
})

function WorkspaceInvitationUnavailable() {
  const { t } = useTranslation()
  return (
    <AuthLayout title={t('workspaceAccess.unavailable')}>
      <Alert tone="error">{t('workspaceAccess.unavailableHint')}</Alert>
      <Link to="/app" className="mt-4 inline-block underline">
        {t('workspaceAccess.cancel')}
      </Link>
    </AuthLayout>
  )
}

function WorkspaceInvitationPage() {
  const { t } = useTranslation()
  const { token } = Route.useParams()
  const invitation = Route.useLoaderData()
  const { invitationOwner } = Route.useRouteContext()
  const currentUser = useSyncExternalStore(subscribeAccount, currentOfflineUser)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function accept() {
    setPending(true)
    setError(null)
    try {
      invitationOwner.assertCurrent()
      const result = await fetchJson(
        `/api/me/workspace-invitations/${encodeURIComponent(token)}/accept`,
        workspaceInvitationAcceptedSchema,
        { method: 'POST' },
      )
      invitationOwner.assertCurrent()
      const active = await authClient.organization.setActive({
        organizationId: result.organizationId,
      })
      invitationOwner.assertCurrent()
      const failure = describeAuthError(active.error)
      if (failure !== null) throw new Error(failure)
      resetShellQueries(queryClient)
      await router.invalidate()
      invitationOwner.assertCurrent()
      await navigate({ to: '/app' })
    } catch (error_) {
      setError(describeError(error_))
    } finally {
      setPending(false)
    }
  }
  if (currentUser !== invitationOwner.userId) return null
  return (
    <AuthLayout
      title={t('workspaceAccess.joinTitle', { name: invitation.workspaceName })}
      description={t('workspaceAccess.joinDescription', {
        permission: t(
          invitation.role === 'editor' ? 'workspaceAccess.edit' : 'workspaceAccess.view',
        ),
      })}
    >
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      <div className="mt-4 flex items-center justify-end gap-4">
        <Link to="/app" className="text-sm underline">
          {t('workspaceAccess.cancel')}
        </Link>
        <Button isPending={pending} onClick={() => void accept()}>
          {t(invitation.isMember ? 'workspaceAccess.open' : 'workspaceAccess.join')}
        </Button>
      </div>
    </AuthLayout>
  )
}
