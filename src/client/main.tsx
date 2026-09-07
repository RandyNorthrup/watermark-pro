import './lib/zod-config'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { preloadRouteImages } from './lib/preload'
import { createQueryClient } from './lib/query-client'
import { applyTheme, readTheme, watchSystemTheme } from './lib/theme'
import { createAppRouter } from './router'
import '@fontsource-variable/inter'
import './styles/app.css'

const rootElement = document.querySelector('#root')
if (rootElement === null) {
  throw new Error('index.html must contain an element with id="root"')
}

applyTheme(readTheme())
watchSystemTheme()

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

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

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
