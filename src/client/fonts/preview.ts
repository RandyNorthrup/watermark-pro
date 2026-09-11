/** Visible font specimens share a small loading pool; scrolling away cancels queued work. */
const MAX_PREVIEW_LOADS = 3
const SPECIMEN_SIZE_PX = 16

interface PreviewJob {
  family: string
  weight: number
  signal: AbortSignal
  resolve: (isLoaded: boolean) => void
  reject: (error: unknown) => void
}

const previews = new Map<string, Promise<void>>()
const queue: PreviewJob[] = []
const loading = { active: 0 }

async function decodePreview(family: string, weight: number): Promise<void> {
  const { loadFont } = await import('./load')
  const resource = await loadFont(family, weight)
  const faces = await document.fonts.load(
    `${String(resource.weight)} ${String(SPECIMEN_SIZE_PX)}px ${JSON.stringify(resource.family)}`,
    resource.family,
  )
  if (faces.length === 0) throw new Error('The font preview could not be loaded.')
}

async function loadCachedPreview(key: string, family: string, weight: number): Promise<void> {
  try {
    await decodePreview(family, weight)
  } catch (error) {
    previews.delete(key)
    throw error
  }
}

async function finishPreview(job: PreviewJob, preview: Promise<void>): Promise<void> {
  try {
    await preview
    job.resolve(!job.signal.aborted)
  } catch (error) {
    job.reject(error)
  } finally {
    loading.active -= 1
    processQueue()
  }
}

function processQueue(): void {
  while (loading.active < MAX_PREVIEW_LOADS) {
    const job = queue.shift()
    if (job === undefined) return
    if (job.signal.aborted) {
      job.resolve(false)
      continue
    }
    loading.active += 1
    const key = `${job.family}/${String(job.weight)}`
    let preview = previews.get(key)
    if (preview === undefined) {
      preview = loadCachedPreview(key, job.family, job.weight)
      previews.set(key, preview)
    }
    void finishPreview(job, preview)
  }
}

/** True means the real face decoded; false means cancelled or FontFaceSet is unavailable. */
export function previewFont(family: string, weight: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  if (typeof document === 'undefined') return Promise.resolve(false)
  const fonts: unknown = Reflect.get(document, 'fonts')
  if (
    typeof fonts !== 'object' ||
    fonts === null ||
    typeof Reflect.get(fonts, 'load') !== 'function'
  )
    return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    queue.push({ family, weight, signal, resolve, reject })
    processQueue()
  })
}
