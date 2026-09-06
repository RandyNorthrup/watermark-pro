/**
 * Turns one photo file into one watermarked output through the worker pool.
 * Decoding happens on the main thread (the only place `File` can be turned
 * into a bitmap), everything after that in a worker. The abort signal is
 * honoured between the two steps; a render already in a worker completes
 * and its result is discarded by the queue.
 */
import { CancelledError, isAborted } from './queue'
import type { WorkerPool } from './worker-pool'
import type { WatermarkSpec } from '../../shared/watermark'
import { fitLongestSide, isSameSize } from '../editor/geometry'
import type { EncodeOptions } from '../engine/encode'
import type { Transform } from '../engine/pipeline'
import type { MarkResources } from '../lib/mark-resources'

export interface BulkSettings {
  output: EncodeOptions
  /** Downscale so the longest side is at most this many pixels; `null` keeps the size. */
  fitLongestSide: number | null
}

export interface BulkResult {
  blob: Blob
  fileName: string
  width: number
  height: number
}

const EXTENSIONS: Record<EncodeOptions['format'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function outputFileName(sourceName: string, format: EncodeOptions['format']): string {
  const dot = sourceName.lastIndexOf('.')
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName
  return `${base}-watermarked.${EXTENSIONS[format]}`
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    throw new Error(`${file.name} is not an image this browser can decode`)
  }
}

export class BulkProcessor {
  readonly #pool: WorkerPool
  readonly #resources: MarkResources

  constructor(pool: WorkerPool, resources: MarkResources) {
    this.#pool = pool
    this.#resources = resources
  }

  async process(
    file: File,
    spec: WatermarkSpec,
    settings: BulkSettings,
    signal: AbortSignal,
  ): Promise<BulkResult> {
    if (isAborted(signal)) {
      throw new CancelledError()
    }
    const [source, inputs] = await Promise.all([decode(file), this.#resources.resolve(spec)])
    if (isAborted(signal)) {
      source.close()
      inputs.image?.close()
      throw new CancelledError()
    }
    const sourceSize = { width: source.width, height: source.height }
    const target =
      settings.fitLongestSide === null
        ? sourceSize
        : fitLongestSide(sourceSize, settings.fitLongestSide)
    const transform: Transform | undefined = isSameSize(target, sourceSize)
      ? undefined
      : { resize: target }
    const result = await this.#pool.apply({
      ...inputs,
      source,
      output: settings.output,
      ...(transform !== undefined && { transform }),
    })
    return {
      blob: result.blob,
      fileName: outputFileName(file.name, settings.output.format),
      width: result.width,
      height: result.height,
    }
  }
}
