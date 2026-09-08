import { createFileRoute, Link } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { emailSchema } from '../../shared/validation'
import { AuthLayout } from '../components/auth-layout'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { authClient } from '../lib/auth-client'
import { describeAuthError } from '../lib/errors'

const searchSchema = z.object({ email: emailSchema })

export const Route = createFileRoute('/check-email')({
  validateSearch: (search) => searchSchema.parse(search),
  component: CheckEmailPage,
})

function CheckEmailPage() {
  const { t } = useTranslation()
  const { email } = Route.useSearch()
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function resend() {
    setIsPending(true)
    const result = await authClient.sendVerificationEmail({ email, callbackURL: '/app' })
    setIsPending(false)
    const failure = describeAuthError(result.error)
    setNotice(
      failure === null
        ? { tone: 'success', text: t('verify.checkEmail.resent') }
        : { tone: 'error', text: failure },
    )
  }

  return (
    <AuthLayout
      title={t('verify.checkEmail.title')}
      description={t('verify.checkEmail.description', { email })}
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-300">
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      <div className="flex flex-col items-start gap-4">
        <MailCheck aria-hidden="true" className="size-10 text-brand-600 dark:text-brand-300" />
        {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Button variant="secondary" isPending={isPending} onClick={() => void resend()}>
          {t('verify.checkEmail.resend')}
        </Button>
      </div>
    </AuthLayout>
  )
}
