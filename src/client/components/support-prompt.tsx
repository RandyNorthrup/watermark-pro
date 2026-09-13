import { useTranslation } from 'react-i18next'

import { ProviderLogo } from './provider-logo'

const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=Q9VC7B42R7K82'

/** A small optional contribution link, using the owner's hosted PayPal button. */
export function SupportPrompt() {
  const { t } = useTranslation()
  return (
    <div className="col-span-2 row-start-2 flex min-w-0 items-center justify-center gap-2 text-xs lg:col-span-1 lg:col-start-2 lg:row-start-1">
      <span className="text-ink-muted">{t('shell.supportPrompt')}</span>
      <a
        href={DONATE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="glass-control inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label={t('shell.supportPayPal')}
      >
        <ProviderLogo provider="paypal" />
        {t('shell.donate')}
      </a>
    </div>
  )
}
