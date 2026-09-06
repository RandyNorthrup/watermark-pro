import { createFileRoute, Link } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { z } from 'zod'

import { emailSchema } from '../../shared/validation'
import { EmailField } from '../components/auth-fields'
import { AuthLayout } from '../components/auth-layout'
import { Turnstile } from '../components/turnstile'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'
import { useCaptcha } from '../lib/use-captcha'
import { useFormErrors } from '../lib/use-form-errors'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

const formSchema = z.object({ email: emailSchema })
type FormValues = z.infer<typeof formSchema>

function ForgotPasswordPage() {
  const [values, setValues] = useState<FormValues>({ email: '' })
  const [isPending, setIsPending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { errors, validate } = useFormErrors<FormValues>()
  const captcha = useCaptcha()

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = validate(formSchema, values)
    if (parsed === null) {
      return
    }
    setIsPending(true)
    setServerError(null)
    const result = await authClient.requestPasswordReset(
      { email: parsed.email, redirectTo: '/reset-password' },
      { headers: captcha.headers },
    )
    setIsPending(false)
    const failure = describeAuthError(result.error)
    if (failure === null) {
      setIsSent(true)
    } else {
      setServerError(failure)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we will send a reset link if an account exists."
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-300">
          Back to sign in
        </Link>
      }
    >
      {isSent ? (
        <Alert tone="success" title="Check your inbox">
          If {values.email} belongs to an account, a reset link is on its way. It expires in one
          hour.
        </Alert>
      ) : (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
          <EmailField
            value={values.email}
            error={errors.email}
            onChange={(email) => {
              setValues({ email })
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
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
