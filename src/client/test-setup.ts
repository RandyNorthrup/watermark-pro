import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement scrolling; the router calls scrollTo on navigation
// for scroll restoration, which would otherwise log "Not implemented" noise.
Object.defineProperty(window, 'scrollTo', {
  value: () => {
    // Intentionally a no-op.
  },
  writable: true,
})

// Vitest globals are off, so Testing Library cannot register this itself.
afterEach(() => {
  cleanup()
})
