import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import type { z } from 'zod'

import { PASSWORD_MIN_LENGTH } from '../../shared/constants'
import { signUpSchema } from '../../shared/validation'
import { EmailField, PasswordField } from '../components/auth-fields'
import { AuthLayout } from '../components/auth-layout'
import { Turnstile } from '../components/turnstile'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Field } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'
import { useCaptcha } from '../lib/use-captcha'
import { useFormErrors } from '../lib/use-form-errors'

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
})

type SignUpValues = z.infer<typeof signUpSchema>

function SignUpPage() {
  const navigate = useNavigate()
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
      { ...parsed, callbackURL: '/app' },
      { headers: captcha.headers },
    )
    setIsPending(false)
    if (result.error !== null) {
      setServerError(describeAuthError(result.error))
      return
    }
    await navigate({ to: '/check-email', search: { email: parsed.email } })
  }

  return (
    <AuthLayout
      title="Create your account"
      description="A verification link will be sent to your email."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 dark:text-brand-300">
            Sign in
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
        <Field label="Name" error={errors.name}>
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
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. A few unrelated words work well.`}
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
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
