/**
 * Web Worker entry: applies watermarks off the main thread on
 * `OffscreenCanvas`. Fonts are loaded into the worker's own FontFaceSet on
 * first use and cached by family and weight.
 */
import { offscreenBackend } from './canvas'
import { closeInputBitmaps, toApplyRequest } from './engine'
import { FontLoader } from './fonts'
import { applyWatermark } from './pipeline'
import type { ApplyMessage, WorkerRequest, WorkerResponse } from './protocol'

const fonts = new FontLoader(self.fonts)

function reply(message: WorkerResponse): void {
  self.postMessage(message)
}

async function handle(message: ApplyMessage): Promise<void> {
  try {
    await fonts.ensure(message.fonts)
    const result = await applyWatermark(toApplyRequest(message), offscreenBackend)
    reply({ type: 'done', id: message.id, ...result })
  } catch (error) {
    reply({
      type: 'failed',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    closeInputBitmaps(message)
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data)
})
