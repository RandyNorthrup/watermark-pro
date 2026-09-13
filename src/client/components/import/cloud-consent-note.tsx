import { useTranslation } from 'react-i18next'

import type { CloudProvider } from '../../../shared/cloud-connections'

/** Managed Microsoft tenants decide whether users may authorize this application. */
export function CloudConsentNote({ provider }: { provider: CloudProvider }) {
  const { t } = useTranslation()
  if (provider !== 'onedrive') return null
  return <p className="text-xs text-ink-muted">{t('cloudStorage.microsoftConsent')}</p>
}
