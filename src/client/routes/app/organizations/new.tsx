import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'

import { newOrganizationSchema, slugify } from '../../../../shared/validation'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { Field } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { authClient } from '../../../lib/auth-client'
import { describeAuthError } from '../../../lib/errors'
import { refetchShellQueries } from '../../../lib/queries'
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
  const { organizations } = Route.useRouteContext()
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
    setIsPending(true)
    setServerError(null)
    const result = await authClient.organization.create({ name: parsed.name, slug: parsed.slug })
    const failure = describeAuthError(result.error)
    if (failure !== null || result.data === null) {
      setIsPending(false)
      setServerError(failure ?? t('organizations.createFailed'))
      return
    }
    await authClient.organization.setActive({ organizationId: result.data.id })
    await queryClient.invalidateQueries()
    // Force the shell queries fresh before leaving, so the /app boot reads the
    // new organization from cache rather than a stale empty list (PLAN §2).
    await refetchShellQueries(queryClient)
    await router.invalidate()
    setIsPending(false)
    await navigate({ to: '/app' })
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
