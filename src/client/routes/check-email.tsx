import { createFileRoute, Link } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { checkEmailSearchSchema } from '../../shared/client-search'
import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { AuthLayout } from '../components/auth-layout'
import { Turnstile } from '../components/turnstile'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { authClient } from '../lib/auth-client'
import { describeAuthError, describeError } from '../lib/errors'
import { useCaptcha } from '../lib/use-captcha'

export const Route = createFileRoute('/check-email')({
  validateSearch: (search) => checkEmailSearchSchema.parse(search),
  component: CheckEmailPage,
})

function CheckEmailPage() {
  const { t } = useTranslation()
  const { email } = Route.useSearch()
  const [isPending, setIsPending] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const captcha = useCaptcha()

  async function resend() {
    if (!captcha.isReady) return
    setIsPending(true)
    try {
      const result = await authClient.sendVerificationEmail(
        { email, callbackURL: '/app' },
        { headers: captcha.headers },
      )
      const failure = describeAuthError(result.error)
      setNotice(
        failure === null
          ? { tone: 'success', text: t('verify.checkEmail.resent') }
          : { tone: 'error', text: failure },
      )
    } catch (error) {
      setNotice({ tone: 'error', text: describeError(error) })
    } finally {
      captcha.reset()
      setIsPending(false)
    }
  }

  return (
    <AuthLayout
      title={t('verify.checkEmail.title')}
      description={t('verify.checkEmail.description', { email })}
      footer={
        <Link
          to="/login"
          search={{
            redirect: '/app',
          }}
          className="font-medium text-brand-600 dark:text-brand-300"
        >
          {t('auth.backToSignIn')}
        </Link>
      }
    >
      <div className="flex flex-col items-start gap-4">
        <MailCheck aria-hidden="true" className="size-10 text-brand-600 dark:text-brand-300" />
        {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
        {captcha.isUnavailable ? (
          <Alert tone="error">{t('auth.humanCheck.unavailable')}</Alert>
        ) : null}
        {captcha.siteKey === null ? null : (
          <Turnstile
            key={captcha.generation}
            siteKey={captcha.siteKey}
            action={HUMAN_VERIFICATION.actions.recovery}
            onToken={captcha.onToken}
          />
        )}
        <Button
          variant="secondary"
          isPending={isPending}
          disabled={!captcha.isReady}
          onClick={() => void resend()}
        >
          {t('verify.checkEmail.resend')}
        </Button>
      </div>
    </AuthLayout>
  )
}
