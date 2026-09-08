/**
 * Web Worker entry: transcodes video off the main thread, drawing the mark on
 * every frame through the engine's `composeMark` on an `OffscreenCanvas`.
 * Models its message protocol on `engine/worker.ts`.
 *
 * Unlike the engine worker, this file is type-checked under the DOM library
 * (the client project), because mediabunny's public types reference DOM-only
 * types (`HTMLCanvasElement`, `CanvasRenderingContext2D`) that the WebWorker
 * library lacks. The dedicated-worker globals are therefore reached through a
 * single asserted scope, the way `main.tsx` reaches the launch-queue globals.
 */
import { CancelledError } from './errors'
import type { TranscodeStartMessage, VideoWorkerRequest, VideoWorkerResponse } from './protocol'
import { transcodeVideo } from './transcode'
import { FontLoader } from '../engine/fonts'

/** The dedicated-worker globals this file uses, typed for the DOM-library build. */
interface VideoWorkerScope {
  readonly fonts: FontFaceSet
  postMessage(message: VideoWorkerResponse): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<VideoWorkerRequest>) => void,
  ): void
}

const scope = self as unknown as VideoWorkerScope
const fonts = new FontLoader(scope.fonts)
/** The controller of the transcode in flight, in a holder so handlers set a field, not the binding. */
const active: { controller: AbortController | null } = { controller: null }

function reply(message: VideoWorkerResponse): void {
  scope.postMessage(message)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handle(message: TranscodeStartMessage): Promise<void> {
  const jobController = new AbortController()
  active.controller = jobController
  try {
    await fonts.ensure(message.fonts)
    const blob = await transcodeVideo(
      {
        source: message.source,
        marks: message.marks,
        plan: message.plan,
        signal: jobController.signal,
      },
      {
        onProgress: (frames, timestamp) => {
          reply({ type: 'progress', id: message.id, frames, timestamp })
        },
      },
    )
    reply({ type: 'done', id: message.id, blob })
  } catch (error) {
    if (error instanceof CancelledError) {
      reply({ type: 'cancelled', id: message.id })
    } else {
      reply({ type: 'failed', id: message.id, message: describe(error) })
    }
  } finally {
    if (active.controller === jobController) {
      active.controller = null
    }
  }
}

scope.addEventListener('message', (event) => {
  const request = event.data
  if (request.type === 'transcode') {
    void handle(request)
  } else {
    active.controller?.abort()
  }
})
