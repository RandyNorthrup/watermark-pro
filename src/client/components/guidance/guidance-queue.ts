import type { GuidanceTopic } from '../../../shared/guidance'

export interface GuidanceItem {
  topic: GuidanceTopic
  anchor: HTMLElement | null
}
interface GuidanceState {
  active: GuidanceItem | null
  isBlocked: boolean
}

/** One account owns one queue. A claim must commit before any optional tip becomes visible. */
export class GuidanceQueue {
  readonly #claim: (topic: GuidanceTopic) => Promise<boolean>
  readonly #listeners = new Set<() => void>()
  readonly #consumed = new Set<GuidanceTopic>()
  readonly #pending: GuidanceItem[] = []
  #state: GuidanceState = { active: null, isBlocked: true }
  #isOnline = false
  #isClaiming = false
  #isDisposed = false
  #generation = 0
  #context = ''

  readonly getSnapshot = (): GuidanceState => this.#state
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  constructor(canClaim: (topic: GuidanceTopic) => Promise<boolean>) {
    this.#claim = canClaim
  }

  #publish(state: GuidanceState): void {
    if (this.#isDisposed) return
    this.#state = state
    for (const listener of this.#listeners) listener()
  }

  #hasContext(context: string): boolean {
    return this.#context === context
  }

  #isCurrent(generation: number): boolean {
    return !this.#isDisposed && generation === this.#generation
  }

  async #advance(): Promise<void> {
    if (
      this.#isDisposed ||
      this.#isClaiming ||
      !this.#isOnline ||
      this.#state.isBlocked ||
      this.#state.active !== null
    )
      return
    const item = this.#pending.shift()
    if (item === undefined) return
    this.#isClaiming = true
    const generation = this.#generation
    const context = this.#context
    // Strict Mode's setup/cleanup rehearsal must not consume a server claim.
    // Let synchronous navigation and cleanup finish before any request starts.
    await Promise.resolve()
    if (!this.#isCurrent(generation)) return
    try {
      const isClaimed = await this.#claim(item.topic)
      if (!this.#isCurrent(generation)) return
      this.#consumed.add(item.topic)
      if (isClaimed && this.#hasContext(context)) this.#publish({ ...this.#state, active: item })
    } catch {
      // Optional guidance waits for a later click/reconnect. A failed write
      // never displays a tip or masquerades as a saved dismissal.
      if (this.#isCurrent(generation)) {
        if (this.#hasContext(context)) this.#pending.unshift(item)
        this.#isClaiming = false
      }
      return
    }
    this.#isClaiming = false
    void this.#advance()
  }

  activate(): void {
    this.#isDisposed = false
  }

  setContext(context: string): void {
    if (this.#context === context) return
    this.#context = context
    this.#pending.length = 0
    this.#publish({ ...this.#state, active: null })
  }

  enqueue(topic: GuidanceTopic, anchor: HTMLElement | null): void {
    if (this.#isDisposed || this.#consumed.has(topic)) return
    if (this.#pending.every((item) => item.topic !== topic)) this.#pending.push({ topic, anchor })
    void this.#advance()
  }

  setBlocked(isBlocked: boolean): void {
    if (this.#state.isBlocked === isBlocked) return
    this.#publish({ ...this.#state, isBlocked })
    void this.#advance()
  }

  setOnline(isOnline: boolean): void {
    this.#isOnline = isOnline
    void this.#advance()
  }

  dismiss(): void {
    this.#publish({ ...this.#state, active: null })
    void this.#advance()
  }

  dispose(): void {
    this.#isDisposed = true
    this.#generation += 1
    this.#isClaiming = false
    this.#pending.length = 0
    this.#listeners.clear()
  }
}
