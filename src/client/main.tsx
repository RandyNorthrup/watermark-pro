import './lib/zod-config'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'

import { hasInterfaceLanguage, initI18n } from './i18n'
import { showBootFailure } from './lib/boot-failure'
import { receiveLaunchFiles } from './lib/launch-files'
import { preloadRouteImages } from './lib/preload'
import { createQueryClient } from './lib/query-client'
import { installErrorReporting } from './lib/report-error'
import { applyTheme, readTheme, watchSystemTheme } from './lib/theme'
import { yieldToMain } from './lib/yield-to-main'
import { createAppRouter } from './router'
import '@fontsource-variable/inter'
import './styles/app.css'

const rootElement = document.querySelector('#root')
if (rootElement === null) {
  throw new Error('No #root.')
}

applyTheme(readTheme())
watchSystemTheme()

// Report uncaught errors to the admin console in production only (development
// and the e2e run surface errors directly and would otherwise flood the table).
if (import.meta.env.PROD) {
  installErrorReporting()
}

// Desktop file handling (installed PWA): the OS opens the app with the files
// the user chose. One photo goes to the editor, several to the bulk tool.
interface LaunchParams {
  files?: readonly FileSystemFileHandle[]
}
const launchWindow = window as unknown as {
  launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void }
}

/**
 * Whether the interface can render: its catalogue loaded, or English already
 * did. Rendering regardless of the outcome means a catalogue hiccup cannot
 * leave a blank page (i18next falls back to English on its own).
 */
async function canRenderInterface(): Promise<boolean> {
  try {
    await initI18n()
    return true
  } catch {
    return hasInterfaceLanguage()
  }
}

/**
 * Settles once the route load does. A failed load still renders (the router
 * loads again on mount) and reaches the global error handlers like any
 * uncaught error.
 */
async function settleRouteLoad(router: ReturnType<typeof createAppRouter>): Promise<void> {
  try {
    await router.load()
  } catch (error) {
    globalThis.reportError(error)
  }
}

/**
 * Startup runs as short tasks rather than one: module evaluation, router
 * construction, the route code and image requests, then the session check and
 * the first render. Each yield lets a phone paint and respond in between
 * (PLAN.md §5.5 mobile blocking-time budget). Every request still starts
 * before the language catalogue arrives.
 */
async function boot(rootElement: Element): Promise<void> {
  await yieldToMain()
  const queryClient = createQueryClient()
  // The private route installs offline services before admission, including an
  // in-app navigation from sign-in. Public startup does not restore private data.
  const router = createAppRouter(queryClient)
  await yieldToMain()

  // The routes for this URL need their code as soon as the session check
  // that gates them finishes; start both downloads now rather than in turn.
  // One fewer round trip on a phone (PLAN.md §5.5).
  const matchedRoutes = router
    .matchRoutes(window.location.pathname)
    .map((match) => router.routesById[match.routeId])
  for (const route of matchedRoutes) {
    void router.loadRouteChunk(route)
  }
  // Likewise the image a matched route paints first (`lib/preload.ts`).
  preloadRouteImages(matchedRoutes)
  await yieldToMain()

  // Route admission does not depend on translated UI. Start its session and data
  // requests while the language catalogue loads, retaining the same route guards.
  const routeSettled = settleRouteLoad(router)

  // Web Share Target (Android): a single-purpose service worker receives shared
  // photos and hands them to /app/bulk. Registered under its own scope so it
  // never intercepts anything else.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/share-target-sw.js', { scope: '/share-target' })
  }

  launchWindow.launchQueue?.setConsumer((params) => {
    void receiveLaunchFiles(params.files ?? [], (to) => router.navigate({ to }))
  })

  const root = createRoot(rootElement)
  function renderApp(): void {
    const app = (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    // A transition lets React yield between units of the first render instead
    // of blocking the main thread for the whole tree (PLAN.md §5.5).
    startTransition(() => {
      root.render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)
    })
  }

  // Load the interface language before the first paint so it never flashes
  // English. The first render also waits for the route load. Matches the router
  // has already committed mount inside the one time-sliced transition above; a load
  // that finished after mount would reach React through the router's store,
  // which always renders synchronously and blocked a phone for the whole page
  // (PLAN.md §5.5). The static skeleton stays painted until then.
  const [canRender] = await Promise.all([canRenderInterface(), routeSettled])
  if (canRender) {
    renderApp()
    return
  }
  showBootFailure(rootElement)
}

// A startup failure reaches the production error reporter as an unhandled rejection.
void boot(rootElement)
