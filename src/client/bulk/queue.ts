/**
 * Concurrency-limited job queue with cancel and retry, independent of what
 * the jobs do. Items run in submission order, failures never stop the rest,
 * and cancelling aborts in-flight work through an `AbortSignal` while
 * leaving finished results in place.
 */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface JobState<Input, Output> {
  id: string
  input: Input
  status: JobStatus
  output: Output | null
  error: string | null
  /** Wall-clock milliseconds of the last attempt, for throughput reporting. */
  durationMs: number | null
}

export interface QueueSnapshot<Input, Output> {
  jobs: readonly JobState<Input, Output>[]
  isRunning: boolean
  /** True while paused: running jobs finish but no new ones are dequeued. */
  isPaused: boolean
  /** True once every job has left the queued and running states. */
  isSettled: boolean
}

export type JobRunner<Input, Output> = (input: Input, signal: AbortSignal) => Promise<Output>

export interface QueueOptions<Input, Output> {
  concurrency: number
  run: JobRunner<Input, Output>
  onChange?: ((snapshot: QueueSnapshot<Input, Output>) => void) | undefined
}

export class CancelledError extends Error {
  override readonly name = 'CancelledError'

  constructor() {
    super('cancelled')
  }
}

/** Read through a function so TypeScript does not narrow `aborted` across an await. */
export function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export class JobQueue<Input, Output> {
  readonly #concurrency: number
  readonly #run: JobRunner<Input, Output>
  readonly #onChange: ((snapshot: QueueSnapshot<Input, Output>) => void) | undefined
  readonly #jobs: JobState<Input, Output>[] = []
  #controller = new AbortController()
  #active = 0
  #nextId = 1
  #isPaused = false

  constructor(options: QueueOptions<Input, Output>) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer')
    }
    this.#concurrency = options.concurrency
    this.#run = options.run
    this.#onChange = options.onChange
  }

  #notify(): void {
    this.#onChange?.(this.snapshot)
  }

  async #drain(): Promise<void> {
    for (;;) {
      if (this.#isPaused || isAborted(this.#controller.signal)) {
        return
      }
      const job = this.#jobs.find((candidate) => candidate.status === 'queued')
      if (job === undefined) {
        return
      }
      job.status = 'running'
      this.#active += 1
      this.#notify()
      const started = performance.now()
      try {
        const output = await this.#run(job.input, this.#controller.signal)
        if (isAborted(this.#controller.signal)) {
          job.status = 'cancelled'
        } else {
          job.status = 'done'
          job.output = output
          job.error = null
        }
      } catch (error) {
        if (isAborted(this.#controller.signal) || error instanceof CancelledError) {
          job.status = 'cancelled'
        } else {
          job.status = 'failed'
          job.error = describe(error)
        }
      } finally {
        job.durationMs = performance.now() - started
        this.#active -= 1
        this.#notify()
      }
    }
  }

  get snapshot(): QueueSnapshot<Input, Output> {
    const jobs = this.#jobs.map((job) => ({ ...job }))
    const isRunning = this.#active > 0
    const isSettled =
      jobs.length > 0 && jobs.every((job) => job.status !== 'queued' && job.status !== 'running')
    return { jobs, isRunning, isPaused: this.#isPaused, isSettled }
  }

  /** Queues inputs; call `start` to process them. Returns the new job ids. */
  add(inputs: readonly Input[]): string[] {
    const ids: string[] = []
    for (const input of inputs) {
      const id = `job-${String(this.#nextId)}`
      this.#nextId += 1
      ids.push(id)
      this.#jobs.push({ id, input, status: 'queued', output: null, error: null, durationMs: null })
    }
    this.#notify()
    return ids
  }

  /** Runs queued jobs up to the concurrency limit; resolves when the queue settles. */
  async start(): Promise<QueueSnapshot<Input, Output>> {
    if (isAborted(this.#controller.signal)) {
      this.#controller = new AbortController()
    }
    this.#isPaused = false
    const workers = Array.from({ length: this.#concurrency }, () => this.#drain())
    await Promise.all(workers)
    this.#notify()
    return this.snapshot
  }

  /** Stops dequeuing new jobs; jobs already running finish. */
  pause(): void {
    if (this.#isPaused) {
      return
    }

    this.#isPaused = true
    this.#notify()
  }

  /** Resumes a paused queue, draining the jobs that were left queued. */
  async resume(): Promise<QueueSnapshot<Input, Output>> {
    if (!this.#isPaused) {
      return this.snapshot
    }
    return await this.start()
  }

  /** Re-queues one job (a per-photo override changed) and processes just it. */
  async rerun(id: string): Promise<QueueSnapshot<Input, Output>> {
    const job = this.#jobs.find((candidate) => candidate.id === id)
    if (job === undefined) {
      return this.snapshot
    }
    job.status = 'queued'
    job.output = null
    job.error = null
    this.#notify()
    return await this.start()
  }

  /** Aborts running jobs and marks queued ones cancelled; finished results stay. */
  cancel(): void {
    this.#controller.abort()
    for (const job of this.#jobs) {
      if (job.status === 'queued') {
        job.status = 'cancelled'
      }
    }
    this.#notify()
  }

  /** Puts failed and cancelled jobs back in the queue. */
  retry(): number {
    let count = 0
    for (const job of this.#jobs) {
      if (job.status !== 'failed' && job.status !== 'cancelled') {
        continue
      }
      job.status = 'queued'
      job.error = null
      job.output = null
      count += 1
    }
    this.#notify()
    return count
  }

  /** Drops every job; running ones are aborted first. */
  clear(): void {
    this.cancel()
    this.#jobs.length = 0
    this.#notify()
  }
}
