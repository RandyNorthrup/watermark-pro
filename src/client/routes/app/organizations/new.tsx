import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { type SubmitEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'

import { newOrganizationSchema, slugify } from '../../../../shared/validation'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { Field } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { authClient } from '../../../lib/auth-client'
import { describeAuthError, describeError } from '../../../lib/errors'
import { captureOfflineOwner } from '../../../lib/offline-context'
import { resetShellQueries } from '../../../lib/queries'
import { useFormErrors } from '../../../lib/use-form-errors'

export const Route = createFileRoute('/app/organizations/new')({
  component: NewOrganizationPage,
})

type FormValues = z.infer<typeof newOrganizationSchema>

function NewOrganizationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { organizations, session } = Route.useRouteContext()
  const account = useMemo(() => {
    const owner = captureOfflineOwner()
    if (owner.userId !== session.user.id) throw new Error('The signed-in account changed.')
    return owner
  }, [session.user.id])
  const submission = useRef<AbortController | null>(null)
  useEffect(() => () => submission.current?.abort(), [])
  const [values, setValues] = useState<FormValues>({ name: '', slug: '' })
  const [hasEditedSlug, setHasEditedSlug] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { errors, validate } = useFormErrors<FormValues>()

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(newOrganizationSchema, values)
    if (parsed === null) {
      return
    }
    submission.current?.abort()
    const controller = new AbortController()
    submission.current = controller
    const assertCurrent = () => {
      account.assertCurrent()
      if (controller.signal.aborted) throw new Error('The workspace form closed.')
    }
    setIsPending(true)
    setServerError(null)
    try {
      assertCurrent()
      const result = await authClient.organization.create({ name: parsed.name, slug: parsed.slug })
      assertCurrent()
      const failure = describeAuthError(result.error)
      if (failure !== null || result.data === null)
        throw new Error(failure ?? t('organizations.createFailed'))
      const active = await authClient.organization.setActive({ organizationId: result.data.id })
      assertCurrent()
      const activeFailure = describeAuthError(active.error)
      if (activeFailure !== null || active.data === null)
        throw new Error(activeFailure ?? t('organizations.createFailed'))
      // Only the shell changed. Unrelated media/preparation requests must not
      // hold this completed creation hostage or refetch the previous workspace.
      resetShellQueries(queryClient)
      await router.invalidate()
      assertCurrent()
      await navigate({ to: '/app' })
    } catch (error) {
      try {
        assertCurrent()
      } catch {
        return
      }
      setServerError(describeError(error))
    } finally {
      if (!controller.signal.aborted) setIsPending(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(organizations.length === 0 ? 'organizations.firstTitle' : 'organizations.newTitle')}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{t('organizations.description')}</p>
      </header>
      <Card>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
          <Field label={t('organizations.nameLabel')} error={errors.name}>
            {(control) => (
              <Input
                {...control}
                autoComplete="organization"
                value={values.name}
                onChange={(event) => {
                  const name = event.target.value
                  setValues({ name, slug: hasEditedSlug ? values.slug : slugify(name) })
                }}
              />
            )}
          </Field>
          <Field
            label={t('organizations.slugLabel')}
            hint={t('organizations.slugHint')}
            error={errors.slug}
          >
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                value={values.slug}
                onChange={(event) => {
                  setHasEditedSlug(true)
                  setValues({ ...values, slug: event.target.value })
                }}
              />
            )}
          </Field>
          <Button type="submit" isPending={isPending} className="self-end">
            {t('organizations.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
