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
