/**
 * Web Worker entry: applies watermarks off the main thread. Fonts are loaded
 * into the worker's own FontFaceSet on first use and cached by family and
 * weight.
 */
import { applyWatermark } from './pipeline'
import type { ApplyMessage, WorkerRequest, WorkerResponse } from './protocol'

const loadedFonts = new Set<string>()

async function ensureFonts(fonts: ApplyMessage['fonts']): Promise<void> {
  for (const font of fonts) {
    const key = `${font.family}#${String(font.weight)}`
    if (loadedFonts.has(key)) {
      continue
    }
    const face = new FontFace(font.family, `url(${font.url})`, { weight: String(font.weight) })
    await face.load()
    self.fonts.add(face)
    loadedFonts.add(key)
  }
}

function reply(message: WorkerResponse): void {
  self.postMessage(message)
}

async function handle(message: ApplyMessage): Promise<void> {
  try {
    await ensureFonts(message.fonts)
    const result = await applyWatermark({
      source: message.source,
      mark: {
        spec: message.spec,
        ...(message.image !== undefined && { image: message.image }),
        ...(message.iconPath !== undefined && { iconPath: message.iconPath }),
      },
      output: message.output,
      ...(message.transform !== undefined && { transform: message.transform }),
    })
    reply({ type: 'done', id: message.id, ...result })
  } catch (error) {
    reply({
      type: 'failed',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    message.source.close()
    message.image?.close()
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data)
})
