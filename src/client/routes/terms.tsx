import { createFileRoute } from '@tanstack/react-router'

import { LegalPage, type LegalSection } from './privacy'
import { APP_NAME } from '../../shared/constants'

const LAST_UPDATED = 'September 7, 2026'

const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    heading: 'Accepting these terms',
    paragraphs: [
      `Using ${APP_NAME} means you agree to these terms. If you do not agree, please do not use the service.`,
    ],
  },
  {
    heading: 'What the service does',
    paragraphs: [
      `${APP_NAME} watermarks photographs. The watermarking itself runs in your browser; optional features such as saving photos and logos, working in a team, and sharing use server-side storage on Cloudflare.`,
      'The software is free and open source under the MIT licence.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'Team features need an account with a verified email address. Keep your password to yourself; you are responsible for what happens under your account.',
      'You can sign out of your sessions at any time, and using a password-reset link signs out your other sessions.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You keep every right you already hold in the photos and watermarks you upload or create. You are responsible for having the right to use the images you bring to the service.',
      'The app processes your content only to provide the features you use, and stores it only when you choose to save it. It is never used to train anything or shared with third parties.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'Do not use the service to break the law, or to upload or share content you have no right to use. Do not try to bypass security controls or rate limits, or to reach data belonging to organizations you are not a member of.',
      'Access within an organization follows your role, and those roles are enforced on the server.',
    ],
  },
  {
    heading: 'Teams and roles',
    paragraphs: [
      'An organization can have owner, admin, editor, and viewer roles. What each member can see and do is limited to their role, checked on every request rather than only hidden in the interface.',
    ],
  },
  {
    heading: 'Availability, warranty, and changes',
    paragraphs: [
      'The service is provided “as is”, without warranty of any kind, as set out in the MIT licence. Features may change, and the service may be unavailable at times.',
      'These terms may be updated; the date at the top of this page shows when they last changed. Continuing to use the service after a change means you accept the updated terms.',
    ],
  },
  {
    heading: 'Open source',
    paragraphs: [
      `${APP_NAME}’s source code is available under the MIT licence, which lets you inspect, run, and modify it under that licence’s terms.`,
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Questions about these terms, and reports of security problems, can be raised through the project’s GitHub repository.',
    ],
  },
]

export const Route = createFileRoute('/terms')({
  component: TermsPage,
})

function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      lastUpdated={LAST_UPDATED}
      intro={`These terms cover your use of ${APP_NAME}. They are written to be read, and they describe how the service actually behaves rather than adding claims it does not keep.`}
      sections={TERMS_SECTIONS}
      sibling={{ to: '/privacy', label: 'privacy policy' }}
    />
  )
}
