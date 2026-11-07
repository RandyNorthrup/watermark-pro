import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from './lib/query-client'
import { createAppRouter } from './router'

afterEach(() => {
  vi.restoreAllMocks()
})

function documentLoad(type: string): void {
  const entry = { name: '', entryType: 'navigation', startTime: 0, duration: 0, type }
  const withJson = { ...entry, toJSON: () => entry }
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([withJson])
}

function scrollGate() {
  const router = createAppRouter(
    createQueryClient(),
    createMemoryHistory({ initialEntries: ['/login'] }),
  )
  const gate = router.options.scrollRestoration
  if (typeof gate !== 'function') throw new Error('Scroll restoration must be gated.')
  return { gate, router }
}

describe('scroll restoration', () => {
  it('skips only the first render of a freshly navigated document', () => {
    documentLoad('navigate')
    const { gate, router } = scrollGate()
    const location = router.buildLocation({ to: '/login' })
    expect(gate({ location })).toBe(false)
    expect(gate({ location })).toBe(true)
  })

  it('restores on reloads and history traversals', () => {
    for (const type of ['reload', 'back_forward']) {
      documentLoad(type)
      const { gate, router } = scrollGate()
      expect(gate({ location: router.buildLocation({ to: '/login' }) })).toBe(true)
    }
  })

  it('still scrolls a fresh document to its anchor', () => {
    documentLoad('navigate')
    const { gate, router } = scrollGate()
    expect(gate({ location: router.buildLocation({ to: '/terms', hash: 'privacy' }) })).toBe(true)
  })
})
