import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

import { initI18n } from './i18n'

// Every page test renders components that read the catalogue through
// `useTranslation`, so i18next must be initialised (in English) before any of
// them run. English is bundled, so this resolves without a network fetch.
await initI18n('en')

/**
 * Page tests drive the real router, query client and a fake engine through
 * several round trips per step. Testing Library's one-second default for
 * `findBy*` is tuned for a single component on an idle machine; the whole
 * suite under coverage on a shared workstation needs more headroom, and a
 * slow step is still caught by the project's test timeout.
 */
const ASYNC_UTIL_TIMEOUT_MS = 4000
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS })

// jsdom has no canvas; the sample scene placeholder draws nothing here and
// says so once instead of on every render.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  writable: true,
})

// jsdom does not implement scrolling; the router calls scrollTo on navigation
// for scroll restoration, which would otherwise log "Not implemented" noise.
Object.defineProperty(window, 'scrollTo', {
  value: () => {
    // Intentionally a no-op.
  },
  writable: true,
})

function noop(): void {
  // jsdom stand-in; nothing to do.
}

// jsdom lacks the pointer-capture and scrolling APIs Radix primitives call.
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: noop,
  releasePointerCapture: noop,
  scrollIntoView: noop,
})

// Radix measures trigger sizes with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  readonly #callback: ResizeObserverCallback

  unobserve = noop

  disconnect = noop

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback
  }

  /** The real observer reports once on observe; components rely on that first delivery. */
  observe(target: Element): void {
    this.#callback([{ target } as ResizeObserverEntry], this)
  }
}
Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, writable: true })

// Vitest globals are off, so Testing Library cannot register this itself.
afterEach(() => {
  cleanup()
})
