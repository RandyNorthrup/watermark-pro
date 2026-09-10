/** Offline display access is distinct from server authentication and online administration. */
export class OfflineAccessError extends Error {
  readonly reason: 'not-prepared' | 'online-only'
  constructor(reason: 'not-prepared' | 'online-only') {
    super(reason)
    this.reason = reason
  }
}
