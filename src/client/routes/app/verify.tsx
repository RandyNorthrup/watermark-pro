import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { VerifyTool } from '../../components/verify/verify-tool'

export const Route = createFileRoute('/app/verify')({
  component: VerifyPage,
})

function VerifyPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('verify.tool.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('verify.tool.description')}</p>
      </header>
      <VerifyTool />
    </div>
  )
}
