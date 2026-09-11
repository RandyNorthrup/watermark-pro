import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PreviewFrames } from './preview-frames'

let frames: Map<number, FrameRequestCallback>
let sequence = 0
function frame() {
  const callbacks = frames.values().toArray()
  frames.clear()
  for (const callback of callbacks) callback(0)
}

beforeEach(() => {
  frames = new Map()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    sequence += 1
    frames.set(sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => vi.unstubAllGlobals())

describe('preview frame backpressure', () => {
  it('coalesces bursts, renders during continuous input, and preserves the exact final state', async () => {
    const jobs: ReturnType<typeof Promise.withResolvers<number>>[] = []
    const render = vi.fn(async (value: number) => {
      const job = Promise.withResolvers<number>()
      jobs.push(job)
      await job.promise
      return value
    })
    const accept = vi.fn()
    const queue = new PreviewFrames(render, accept, vi.fn(), vi.fn())
    for (let value = 0; value < 100; value += 1) queue.request(value)
    expect(render).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    frame()
    expect(render).toHaveBeenCalledExactlyOnceWith(99)
    for (let value = 100; value < 200; value += 1) queue.request(value)
    frame()
    expect(render).toHaveBeenCalledTimes(1)
    jobs[0]?.resolve(0)
    await vi.waitFor(() => expect(accept).toHaveBeenCalledExactlyOnceWith(99))
    frame()
    expect(render).toHaveBeenLastCalledWith(199)
    jobs[1]?.resolve(0)
    await vi.waitFor(() => expect(accept).toHaveBeenLastCalledWith(199))
    expect(render).toHaveBeenCalledTimes(2)
    queue.dispose()
  })

  it('discards late private results and cancels unstarted work after disposal', async () => {
    const job = Promise.withResolvers<string>()
    const accept = vi.fn()
    const discard = vi.fn()
    const render = vi.fn(() => job.promise)
    const queue = new PreviewFrames(render, accept, vi.fn(), discard)
    queue.request('first')
    frame()
    queue.request('second')
    queue.dispose()
    queue.request('after disposal')
    job.resolve('old-account-blob')
    await vi.waitFor(() => expect(discard).toHaveBeenCalledExactlyOnceWith('old-account-blob'))
    frame()
    expect(accept).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('reports a failure and still renders the newest pending input', async () => {
    const reject = vi.fn()
    const accept = vi.fn()
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('render failed'))
      .mockResolvedValue('next')
    const queue = new PreviewFrames(render, accept, reject, vi.fn())
    queue.request('first')
    frame()
    queue.request('next')
    await vi.waitFor(() => expect(reject).toHaveBeenCalledOnce())
    frame()
    await vi.waitFor(() => expect(accept).toHaveBeenCalledExactlyOnceWith('next'))
    queue.dispose()
  })

  it('cancels a scheduled frame before the renderer starts', () => {
    const render = vi.fn()
    const queue = new PreviewFrames(render, vi.fn(), vi.fn(), vi.fn())
    queue.request('queued')
    queue.dispose()
    frame()
    expect(render).not.toHaveBeenCalled()
  })
})
