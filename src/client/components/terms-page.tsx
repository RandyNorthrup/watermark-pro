import { useTranslation } from 'react-i18next'

import { LegalPage, type LegalSection } from './legal-page'

const LAST_UPDATED = '2026-09-09'

export function TermsPage() {
  const { t } = useTranslation()
  const sections: readonly LegalSection[] = [
    {
      heading: t('legal.terms.accepting.heading'),
      paragraphs: [t('legal.terms.accepting.p1')],
    },
    {
      heading: t('legal.terms.whatItDoes.heading'),
      paragraphs: [t('legal.terms.whatItDoes.p1'), t('legal.terms.whatItDoes.p2')],
    },
    {
      heading: t('legal.terms.account.heading'),
      paragraphs: [t('legal.terms.account.p1'), t('legal.terms.account.p2')],
    },
    {
      heading: t('legal.terms.content.heading'),
      paragraphs: [t('legal.terms.content.p1'), t('legal.terms.content.p2')],
    },
    {
      heading: t('legal.terms.acceptableUse.heading'),
      paragraphs: [t('legal.terms.acceptableUse.p1'), t('legal.terms.acceptableUse.p2')],
    },
    {
      heading: t('legal.terms.teams.heading'),
      paragraphs: [t('legal.terms.teams.p1')],
    },
    {
      heading: t('legal.terms.availability.heading'),
      paragraphs: [t('legal.terms.availability.p1'), t('legal.terms.availability.p2')],
    },
    {
      heading: t('legal.terms.openSource.heading'),
      paragraphs: [t('legal.terms.openSource.p1')],
    },
    {
      heading: t('legal.terms.contact.heading'),
      paragraphs: [t('legal.terms.contact.p1')],
    },
  ]
  return (
    <LegalPage
      title={t('legal.terms.title')}
      lastUpdated={LAST_UPDATED}
      intro={t('legal.terms.intro')}
      sections={sections}
      sibling={{ to: '/privacy', label: t('legal.terms.siblingLabel') }}
    />
  )
}
