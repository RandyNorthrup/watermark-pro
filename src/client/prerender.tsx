/** Build-time rendering uses the same landing, translations, router links, and controls as the app. */
import './lib/zod-config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { t as translate } from 'i18next'
import { Monitor, Moon, Sun } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LandingPage } from './components/landing-page'
import { PrivacyPage } from './components/privacy-page'
import { TermsPage } from './components/terms-page'
import { initI18n, setLocale } from './i18n'
import { sourceCatalogues } from './i18n/source-catalogues'
import type { Locale } from '../shared/locales'

const PUBLIC_PAGES = { '/': LandingPage, '/privacy': PrivacyPage, '/terms': TermsPage }

/** Public content has no account queries: only the live request handler decides who receives this HTML. */
export async function renderPublicPage(locale: Locale, pathname: '/' | '/privacy' | '/terms') {
  await initI18n(locale, sourceCatalogues)
  await setLocale(locale)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  })
  const root = createRootRoute()
  const component = PUBLIC_PAGES[pathname]
  const page = createRoute({ getParentRoute: () => root, path: pathname, component })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
    isServer: true,
  })
  await router.load()
  return {
    html: renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    labels: {
      system: translate('shell.theme.system'),
      light: translate('shell.theme.light'),
      dark: translate('shell.theme.dark'),
    },
    icons: {
      system: renderToStaticMarkup(<Monitor aria-hidden="true" className="size-4" />),
      light: renderToStaticMarkup(<Sun aria-hidden="true" className="size-4" />),
      dark: renderToStaticMarkup(<Moon aria-hidden="true" className="size-4" />),
    },
  }
}

export { SUPPORTED_LOCALES as locales } from '../shared/locales'
