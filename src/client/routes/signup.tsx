import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'

import { PASSWORD_MIN_LENGTH } from '../../shared/constants'
import { INVITATION_HEADER, signupSearchSchema } from '../../shared/invitation'
import { signUpSchema } from '../../shared/validation'
import { EmailField, PasswordField } from '../components/auth-fields'
import { AuthLayout } from '../components/auth-layout'
import { SocialAuth } from '../components/social-auth'
import { Turnstile } from '../components/turnstile'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Field } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'
import { clearPendingInvitation } from '../lib/pending-invitation'
import { useCaptcha } from '../lib/use-captcha'
import { useFormErrors } from '../lib/use-form-errors'

export const Route = createFileRoute('/signup')({
  validateSearch: signupSearchSchema,
  component: SignUpPage,
})

function SignUpPage() {
  type SignUpValues = z.infer<typeof signUpSchema>
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { invitation } = Route.useSearch()
  const [values, setValues] = useState<SignUpValues>({ name: '', email: '', password: '' })
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { errors, validate } = useFormErrors<SignUpValues>()
  const captcha = useCaptcha()

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(signUpSchema, values)
    if (parsed === null) {
      return
    }
    setIsPending(true)
    setServerError(null)
    const result = await authClient.signUp.email(
      {
        ...parsed,
        callbackURL: '/app',
      },
      { headers: { ...captcha.headers, [INVITATION_HEADER]: invitation ?? '' } },
    )
    setIsPending(false)
    if (result.error !== null) {
      setServerError(describeAuthError(result.error))
      return
    }
    clearPendingInvitation()
    await navigate({ to: '/check-email', search: { email: parsed.email } })
  }

  if (invitation === undefined) {
    return (
      <AuthLayout title={t('auth.inviteOnly.title')} description={t('auth.inviteOnly.body')}>
        <Link
          to="/login"
          search={{ invitation }}
          className="font-medium text-brand-600 dark:text-brand-300"
        >
          {t('auth.signup.signIn')}
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.signup.title')}
      description={t('auth.signup.description')}
      footer={
        <>
          {t('auth.signup.footerPrompt')}{' '}
          <Link
            to="/login"
            search={{ invitation }}
            className="font-medium text-brand-600 dark:text-brand-300"
          >
            {t('auth.signup.signIn')}
          </Link>
        </>
      }
    >
      <SocialAuth invitation={invitation} />
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
        <Field label={t('auth.signup.nameLabel')} error={errors.name}>
          {(control) => (
            <Input
              {...control}
              autoComplete="name"
              value={values.name}
              onChange={(event) => {
                setValues({ ...values, name: event.target.value })
              }}
            />
          )}
        </Field>
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
          autoComplete="new-password"
          hint={t('auth.signup.passwordHint', { min: PASSWORD_MIN_LENGTH })}
          onChange={(password) => {
            setValues({ ...values, password })
          }}
        />
        {captcha.siteKey === null ? null : (
          <Turnstile siteKey={captcha.siteKey} onToken={captcha.onToken} />
        )}
        <Button
          type="submit"
          isPending={isPending}
          disabled={!captcha.isReady}
          className="self-end"
        >
          {t('auth.signup.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
