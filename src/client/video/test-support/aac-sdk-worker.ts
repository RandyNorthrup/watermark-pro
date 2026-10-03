import { readSdkAudio, type ReadMode } from './aac-sdk-reader'

interface Request {
  buffer: ArrayBuffer
  mode: ReadMode
}
async function handle(request: Request) {
  try {
    self.postMessage({ report: await readSdkAudio(request.buffer, request.mode) })
  } catch (error: unknown) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
self.addEventListener('message', (event: MessageEvent<Request>) => {
  void handle(event.data)
})
