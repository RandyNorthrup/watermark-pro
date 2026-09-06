import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type SubmitEvent, useState } from 'react'
import { z } from 'zod'

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

const searchSchema = z.object({
  token: z.string().optional(),
  /** Better Auth redirects here with ?error=INVALID_TOKEN when the link is stale. */
  error: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => searchSchema.parse(search),
  component: ResetPasswordPage,
})

const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((form) => form.password === form.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })
type FormValues = z.infer<typeof formSchema>

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { token, error: linkError } = Route.useSearch()
  const [values, setValues] = useState<FormValues>({ password: '', confirm: '' })
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { errors, validate } = useFormErrors<FormValues>()

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
      title="Choose a new password"
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-300">
          Back to sign in
        </Link>
      }
    >
      {isLinkUnusable ? (
        <Alert tone="error" title="This reset link is not valid">
          It may have expired or already been used.{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </Alert>
      ) : (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          {serverError === null ? null : <Alert tone="error">{serverError}</Alert>}
          <Field
            label="New password"
            hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
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
          <Field label="Confirm password" error={errors.confirm}>
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
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
