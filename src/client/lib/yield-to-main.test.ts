import { afterEach, describe, expect, it, vi } from 'vitest'

import { yieldToMain } from './yield-to-main'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('yieldToMain', () => {
  it('uses scheduler.yield where the browser provides it', async () => {
    const schedulerYield = vi.fn(() => Promise.resolve())
    vi.stubGlobal('scheduler', { yield: schedulerYield })
    await yieldToMain()
    expect(schedulerYield).toHaveBeenCalledOnce()
  })

  it('otherwise resumes only after the current task ends', async () => {
    vi.stubGlobal('scheduler', undefined)
    vi.useFakeTimers()
    const settled = vi.fn()
    const pending = yieldToMain()
    void pending.finally(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    await pending
    expect(settled).toHaveBeenCalledOnce()
  })
})
