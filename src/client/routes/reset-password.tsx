import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { resetPasswordSearchSchema } from '../../shared/client-search'
import { PASSWORD_MIN_LENGTH } from '../../shared/constants'
import { passwordSchema } from '../../shared/validation'
import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Field } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'
import { useFormErrors } from '../lib/use-form-errors'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => resetPasswordSearchSchema.parse(search),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const formFields = z.object({ password: passwordSchema, confirm: z.string() })
  type FormValues = z.infer<typeof formFields>
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, error: linkError } = Route.useSearch()
  const [values, setValues] = useState<FormValues>({ password: '', confirm: '' })
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { errors, validate } = useFormErrors<FormValues>()
  const formSchema = formFields.refine((form) => form.password === form.confirm, {
    message: t('auth.resetPassword.mismatch'),
    path: ['confirm'],
  })

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(formSchema, values)
    if (parsed === null || token === undefined) {
      return
    }
    setIsPending(true)
    setServerError(null)
    const result = await authClient.resetPassword({ newPassword: parsed.password, token })
    setIsPending(false)
    const failure = describeAuthError(result.error)
    if (failure === null) {
      await navigate({ to: '/login' })
    } else {
      setServerError(failure)
    }
  }

  const isLinkUnusable = token === undefined || linkError !== undefined

  return (
    <AuthLayout
      title={t('auth.resetPassword.title')}
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-300">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      {isLinkUnusable ? (
        <Alert tone="error" title={t('auth.resetPassword.invalidTitle')}>
          {t('auth.resetPassword.invalidBody')}{' '}
          <Link to="/forgot-password" className="font-medium underline">
            {t('auth.resetPassword.requestNew')}
          </Link>
          {t('auth.resetPassword.invalidEnd')}
        </Alert>
      ) : (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
          <Field
            label={t('auth.resetPassword.newPasswordLabel')}
            hint={t('auth.resetPassword.passwordHint', { min: PASSWORD_MIN_LENGTH })}
            error={errors.password}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => {
                  setValues({ ...values, password: event.target.value })
                }}
              />
            )}
          </Field>
          <Field label={t('auth.resetPassword.confirmLabel')} error={errors.confirm}>
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                value={values.confirm}
                onChange={(event) => {
                  setValues({ ...values, confirm: event.target.value })
                }}
              />
            )}
          </Field>
          <Button type="submit" isPending={isPending} className="self-end">
            {t('auth.resetPassword.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
