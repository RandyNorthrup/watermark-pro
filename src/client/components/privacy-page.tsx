import { useTranslation } from 'react-i18next'

import { LegalPage, type LegalSection } from './legal-page'

const LAST_UPDATED = '2026-09-09'

export function PrivacyPage() {
  const { t } = useTranslation()
  const sections: readonly LegalSection[] = [
    {
      heading: t('legal.privacy.photos.heading'),
      paragraphs: [t('legal.privacy.photos.p1'), t('legal.privacy.photos.p2')],
    },
    {
      heading: t('legal.privacy.storage.heading'),
      paragraphs: [t('legal.privacy.storage.p1'), t('legal.privacy.storage.p2')],
    },
    {
      heading: t('legal.privacy.metadata.heading'),
      paragraphs: [t('legal.privacy.metadata.p1'), t('legal.privacy.metadata.p2')],
    },
    {
      heading: t('legal.privacy.sharing.heading'),
      paragraphs: [t('legal.privacy.sharing.p1'), t('legal.privacy.sharing.p2')],
    },
    {
      heading: t('legal.privacy.account.heading'),
      paragraphs: [t('legal.privacy.account.p1'), t('legal.privacy.account.p2')],
    },
    {
      heading: t('legal.privacy.analytics.heading'),
      paragraphs: [t('legal.privacy.analytics.p1'), t('legal.privacy.analytics.p2')],
    },
    {
      heading: t('legal.privacy.audit.heading'),
      paragraphs: [t('legal.privacy.audit.p1')],
    },
    {
      heading: t('legal.privacy.reporting.heading'),
      paragraphs: [t('legal.privacy.reporting.p1')],
    },
  ]
  return (
    <LegalPage
      title={t('legal.privacy.title')}
      lastUpdated={LAST_UPDATED}
      intro={t('legal.privacy.intro')}
      sections={sections}
      sibling={{ to: '/terms', label: t('legal.privacy.siblingLabel') }}
    />
  )
}
