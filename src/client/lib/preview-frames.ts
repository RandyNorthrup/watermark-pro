/** Runs at most one preview at a time, keeping only the newest queued frame. */
export class PreviewFrames<Input, Output> {
  #pending: { input: Input } | null = null
  #frame: number | null = null
  #busy = false
  #disposed = false

  readonly #render: (input: Input) => Promise<Output>
  readonly #accept: (output: Output) => void
  readonly #reject: (error: unknown) => void
  readonly #discard: (output: Output) => void

  constructor(
    render: (input: Input) => Promise<Output>,
    accept: (output: Output) => void,
    reject: (error: unknown) => void,
    discard: (output: Output) => void,
  ) {
    this.#render = render
    this.#accept = accept
    this.#reject = reject
    this.#discard = discard
  }

  #schedule(): void {
    if (this.#busy || this.#frame !== null || this.#pending === null || this.#disposed) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null
      const pending = this.#pending
      if (pending === null) return
      this.#pending = null
      this.#busy = true
      void this.#run(pending.input)
    })
  }

  async #run(input: Input): Promise<void> {
    try {
      const output = await this.#render(input)
      if (this.#disposed) this.#discard(output)
      else this.#accept(output)
    } catch (error) {
      if (!this.#disposed) this.#reject(error)
    } finally {
      this.#busy = false
      this.#schedule()
    }
  }

  /** Replaces unstarted work; continuous input never resets a debounce timer. */
  request(input: Input): void {
    if (this.#disposed) return
    this.#pending = { input }
    this.#schedule()
  }

  /** Drops queued work and prevents late results from crossing a subject/account boundary. */
  dispose(): void {
    this.#disposed = true
    this.#pending = null
    if (this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
  }
}
