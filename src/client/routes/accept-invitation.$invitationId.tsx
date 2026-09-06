import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ApiRequestError } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { sessionQueryOptions } from '../lib/queries'

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
  errorComponent: ({ error }) => (
    <AuthLayout title="Invitation unavailable">
      <Alert tone="error">{describeError(error)}</Alert>
    </AuthLayout>
  ),
})

function AcceptInvitationPage() {
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
    await router.invalidate()
    await navigate({ to: decision === 'accept' ? '/app/members' : '/app' })
  }

  return (
    <AuthLayout
      title={`Join ${invitation.organizationName}`}
      description={`${invitation.inviterEmail} invited you to join as ${invitation.role}.`}
    >
      <div className="flex flex-col gap-4">
        {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
        <p className="text-sm">
          Role: <Badge>{invitation.role}</Badge>
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            isPending={isPending === 'reject'}
            disabled={isPending !== null}
            onClick={() => void respond('reject')}
          >
            Decline
          </Button>
          <Button
            isPending={isPending === 'accept'}
            disabled={isPending !== null}
            onClick={() => void respond('accept')}
          >
            Accept invitation
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
