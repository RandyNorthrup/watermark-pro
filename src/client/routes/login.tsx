import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { signInSchema } from '../../shared/validation'
import { EmailField, PasswordField } from '../components/auth-fields'
import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'
import { resetShellQueries } from '../lib/queries'
import { useFormErrors } from '../lib/use-form-errors'

const searchSchema = z.object({
  /** Path to return to after signing in; only same-app paths are honoured. */
  redirect: z.string().startsWith('/').optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: (search) => searchSchema.parse(search),
  component: LoginPage,
})

type SignInValues = z.infer<typeof signInSchema>

function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { redirect } = Route.useSearch()
  const [values, setValues] = useState<SignInValues>({ email: '', password: '' })
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const { errors, validate } = useFormErrors<SignInValues>()

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(signInSchema, values)
    if (parsed === null) {
      return
    }
    setIsPending(true)
    setServerError(null)
    setNeedsVerification(false)
    const result = await authClient.signIn.email({ email: parsed.email, password: parsed.password })
    setIsPending(false)
    if (result.error !== null) {
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true)
      } else {
        setServerError(describeAuthError(result.error))
      }
      return
    }
    await queryClient.invalidateQueries()
    resetShellQueries(queryClient)
    await navigate({ to: redirect ?? '/app' })
  }

  return (
    <AuthLayout
      title={t('auth.login.title')}
      description={t('auth.login.description')}
      footer={
        <>
          {t('auth.login.footerPrompt')}{' '}
          <Link to="/signup" className="font-medium text-brand-600 dark:text-brand-300">
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
        {needsVerification ? (
          <Alert tone="info" title={t('auth.login.verifyTitle')}>
            {t('auth.login.verifyBody', { email: values.email })}{' '}
            <Link
              to="/check-email"
              search={{ email: values.email }}
              className="font-medium underline"
            >
              {t('auth.login.resendIt')}
            </Link>
          </Alert>
        ) : null}
        <EmailField
          value={values.email}
          error={errors.email}
          onChange={(email) => {
            setValues({ ...values, email })
          }}
        />
        <PasswordField
          value={values.password}
          error={errors.password}
          autoComplete="current-password"
          onChange={(password) => {
            setValues({ ...values, password })
          }}
        />
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-sm text-ink-muted hover:text-ink">
            {t('auth.login.forgotPassword')}
          </Link>
          <Button type="submit" isPending={isPending}>
            {t('auth.login.submit')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
