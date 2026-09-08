/**
 * Errors shared by the video pipeline. Kept in its own tiny, dependency-free
 * module so both the main thread (`worker-client.ts`) and the Web Worker
 * (`worker.ts` → `transcode.ts`) can throw and recognise a cancellation
 * without pulling in the bulk queue (whose `CancelledError` lives beside DOM
 * code the video worker must not compile against).
 */

/** Thrown when a transcode is cancelled; callers resolve their own flow on it. */
export class CancelledError extends Error {
  override readonly name = 'CancelledError'

  constructor() {
    super('cancelled')
  }
}
