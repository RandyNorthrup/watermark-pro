import { useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ApiRequestError } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { resetShellQueries, sessionQueryOptions } from '../lib/queries'

export const Route = createFileRoute('/accept-invitation/$invitationId')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.query(sessionQueryOptions)
    if (session === null) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } })
    }
  },
  loader: async ({ params }) => {
    const result = await authClient.organization.getInvitation({
      query: { id: params.invitationId },
    })
    if (result.error !== null) {
      throw new ApiRequestError(
        '/api/auth/organization/get-invitation',
        result.error.status,
        result.error.message ?? 'Invitation not found',
      )
    }
    return result.data
  },
  component: AcceptInvitationPage,
  errorComponent: InvitationUnavailable,
})

function InvitationUnavailable({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  return (
    <AuthLayout title={t('auth.acceptInvitation.unavailableTitle')}>
      <Alert tone="error">{describeError(error)}</Alert>
    </AuthLayout>
  )
}

function AcceptInvitationPage() {
  const { t } = useTranslation()
  const invitation = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState<'accept' | 'reject' | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  async function respond(decision: 'accept' | 'reject') {
    setIsPending(decision)
    setServerError(null)
    const result =
      decision === 'accept'
        ? await authClient.organization.acceptInvitation({ invitationId: invitation.id })
        : await authClient.organization.rejectInvitation({ invitationId: invitation.id })
    setIsPending(null)
    const failure = describeAuthError(result.error)
    if (failure !== null) {
      setServerError(failure)
      return
    }
    if (decision === 'accept') {
      await authClient.organization.setActive({ organizationId: invitation.organizationId })
    }
    await queryClient.invalidateQueries()
    resetShellQueries(queryClient)
    await router.invalidate()
    await navigate({ to: decision === 'accept' ? '/app/members' : '/app' })
  }

  return (
    <AuthLayout
      title={t('auth.acceptInvitation.title', { organizationName: invitation.organizationName })}
      description={t('auth.acceptInvitation.description', {
        inviterEmail: invitation.inviterEmail,
        role: invitation.role,
      })}
    >
      <div className="flex flex-col gap-4">
        {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
        <p className="text-sm">
          {t('auth.acceptInvitation.roleLabel')} <Badge>{invitation.role}</Badge>
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            isPending={isPending === 'reject'}
            disabled={isPending !== null}
            onClick={() => void respond('reject')}
          >
            {t('auth.acceptInvitation.decline')}
          </Button>
          <Button
            isPending={isPending === 'accept'}
            disabled={isPending !== null}
            onClick={() => void respond('accept')}
          >
            {t('auth.acceptInvitation.accept')}
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
