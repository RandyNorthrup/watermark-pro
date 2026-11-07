import type { QueryClient } from '@tanstack/react-query'
import { createRouter, type ParsedLocation, type RouterHistory } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

/** Whether this document came from a plain navigation rather than a reload or history traversal. */
function isFreshDocumentLoad(): boolean {
  const entry = performance.getEntriesByType('navigation').at(0)
  return entry !== undefined && 'type' in entry && entry.type === 'navigate'
}

/**
 * Scroll restoration for every render except a fresh document's first one. A
 * new history entry has no saved position and the page already starts at the
 * top, so the router's scroll pass there only forces a full style and layout
 * inside the first commit, lengthening the longest startup task on a phone
 * (PLAN.md §5.5). Reloads, back/forward loads and in-page anchors keep it.
 */
function createScrollRestorationGate(): (options: { location: ParsedLocation }) => boolean {
  const state = { isFirstRender: true }
  return ({ location }) => {
    const isSkipped = state.isFirstRender && location.hash === '' && isFreshDocumentLoad()
    state.isFirstRender = false
    return !isSkipped
  }
}

/**
 * Builds the application router. Production passes no history and gets the
 * browser history; tests pass a memory history to drive navigation headlessly.
 */
export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: createScrollRestorationGate(),
    // Desktop pages scroll below the header; new routes must reset that region too.
    scrollToTopSelectors: ['#main'],
    ...(history !== undefined && { history }),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
