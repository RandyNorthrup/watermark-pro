import { describe, expect, it, vi } from 'vitest'

import { CancelledError, JobQueue, type QueueSnapshot } from './queue'

/** A runner whose completion the test controls per input. */
function controlledRunner() {
  const pending = new Map<
    string,
    { resolve: (value: string) => void; reject: (e: Error) => void }
  >()
  const run = (input: string, signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      pending.set(input, { resolve, reject })
      signal.addEventListener('abort', () => {
        reject(new CancelledError())
      })
    })
  return {
    run,
    finish(input: string) {
      pending.get(input)?.resolve(`${input}!`)
      pending.delete(input)
    },
    fail(input: string, message: string) {
      pending.get(input)?.reject(new Error(message))
      pending.delete(input)
    },
    get running() {
      return pending.keys().toArray()
    },
  }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function statuses(snapshot: QueueSnapshot<string, string>): string[] {
  return snapshot.jobs.map((job) => job.status)
}

describe('JobQueue', () => {
  it('rejects a non-positive concurrency', () => {
    expect(() => new JobQueue({ concurrency: 0, run: () => Promise.resolve('') })).toThrow(
      RangeError,
    )
  })

  it('runs jobs in order, at most `concurrency` at a time, and isolates failures', async () => {
    const runner = controlledRunner()
    const changes: string[][] = []
    const queue = new JobQueue<string, string>({
      concurrency: 2,
      run: runner.run,
      onChange: (snapshot) => {
        changes.push(statuses(snapshot))
      },
    })
    queue.add(['a', 'b', 'c', 'd'])
    const finished = queue.start()
    await settle()
    expect(runner.running).toEqual(['a', 'b'])

    runner.fail('a', 'boom')
    await settle()
    expect(runner.running).toEqual(['b', 'c'])
    runner.finish('b')
    runner.finish('c')
    await settle()
    expect(runner.running).toEqual(['d'])
    runner.finish('d')

    const result = await finished
    expect(statuses(result)).toEqual(['failed', 'done', 'done', 'done'])
    expect(result.jobs[0]?.error).toBe('boom')
    expect(result.jobs[1]?.output).toBe('b!')
    expect(result.jobs.every((job) => job.durationMs !== null)).toBe(true)
    expect(result.isSettled).toBe(true)
    expect(result.isRunning).toBe(false)
    expect(changes.at(-1)).toEqual(['failed', 'done', 'done', 'done'])
  })

  it('cancels running and queued jobs, keeps finished ones, and can retry the rest', async () => {
    const runner = controlledRunner()
    const queue = new JobQueue<string, string>({ concurrency: 1, run: runner.run })
    queue.add(['a', 'b', 'c'])
    const first = queue.start()
    await settle()
    runner.finish('a')
    await settle()
    expect(runner.running).toEqual(['b'])
    queue.cancel()
    const cancelled = await first
    expect(statuses(cancelled)).toEqual(['done', 'cancelled', 'cancelled'])
    expect(cancelled.isSettled).toBe(true)

    expect(queue.retry()).toBe(2)
    expect(statuses(queue.snapshot)).toEqual(['done', 'queued', 'queued'])
    const second = queue.start()
    await settle()
    runner.finish('b')
    await settle()
    runner.finish('c')
    const done = await second
    expect(statuses(done)).toEqual(['done', 'done', 'done'])
    expect(done.jobs[1]?.output).toBe('b!')
  })

  it('treats a runner that ignores the abort signal as cancelled once the signal fires', async () => {
    let release: (() => void) | null = null
    const queue = new JobQueue<string, string>({
      concurrency: 1,
      run: () =>
        new Promise<string>((resolve) => {
          release = () => {
            resolve('late')
          }
        }),
    })
    queue.add(['a'])
    const finished = queue.start()
    await settle()
    queue.cancel()
    ;(release as (() => void) | null)?.()
    const result = await finished
    expect(result.jobs[0]?.status).toBe('cancelled')
    expect(result.jobs[0]?.output).toBeNull()
  })

  it('pauses without dequeuing new jobs and resumes the rest', async () => {
    const runner = controlledRunner()
    const queue = new JobQueue<string, string>({ concurrency: 1, run: runner.run })
    queue.add(['a', 'b', 'c'])
    const first = queue.start()
    await settle()
    expect(runner.running).toEqual(['a'])
    queue.pause()
    expect(queue.snapshot.isPaused).toBe(true)
    runner.finish('a')
    const paused = await first
    // The running job finished but no new one was dequeued while paused.
    expect(statuses(paused)).toEqual(['done', 'queued', 'queued'])

    const resumed = queue.resume()
    expect(queue.snapshot.isPaused).toBe(false)
    await settle()
    expect(runner.running).toEqual(['b'])
    runner.finish('b')
    await settle()
    runner.finish('c')
    const done = await resumed
    expect(statuses(done)).toEqual(['done', 'done', 'done'])
  })

  it('reruns one job in place, leaving the other results untouched', async () => {
    const queue = new JobQueue<string, string>({
      concurrency: 2,
      run: (input) => Promise.resolve(`${input}:v1`),
    })
    queue.add(['a', 'b'])
    const done = await queue.start()
    expect(done.jobs.map((job) => job.output)).toEqual(['a:v1', 'b:v1'])

    const bId = done.jobs[1]?.id ?? ''
    const after = await queue.rerun(bId)
    // Only job b re-ran; a keeps its result.
    expect(after.jobs[0]?.output).toBe('a:v1')
    expect(after.jobs[1]?.status).toBe('done')
  })

  it('reports non-Error failures and clears everything', async () => {
    const queue = new JobQueue<string, string>({
      concurrency: 3,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the queue must cope with non-Error rejections
      run: (input) => (input === 'bad' ? Promise.reject('string reason') : Promise.resolve(input)),
    })
    queue.add(['ok', 'bad'])
    const result = await queue.start()
    expect(result.jobs[1]?.error).toBe('string reason')
    const onChange = vi.fn()
    const watched = new JobQueue<string, string>({
      concurrency: 1,
      run: (input) => Promise.resolve(input),
      onChange,
    })
    watched.add(['x'])
    watched.clear()
    expect(watched.snapshot.jobs).toEqual([])
    expect(watched.snapshot.isSettled).toBe(false)
    expect(onChange).toHaveBeenCalled()
  })
})
