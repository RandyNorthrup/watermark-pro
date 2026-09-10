import { createFileRoute } from '@tanstack/react-router'

import { PrivacyPage } from '../components/privacy-page'

export const Route = createFileRoute('/privacy')({ component: PrivacyPage })
