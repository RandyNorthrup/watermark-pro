/**
 * Turns one photo file into one watermarked output through the worker pool.
 * Decoding happens on the main thread (the only place `File` can be turned
 * into a bitmap), everything after that in a worker. The abort signal is
 * honoured between the two steps; a render already in a worker completes
 * and its result is discarded by the queue.
 */
import { CancelledError, isAborted } from './queue'
import type { WorkerPool } from './worker-pool'
import {
  type Adjustments,
  isIdentityAdjustments,
  isIdentityOrientation,
  type Orientation,
} from '../../shared/adjustments'
import type { WatermarkSpec } from '../../shared/watermark'
import { fitLongestSide, isSameSize } from '../editor/geometry'
import type { EncodeOptions } from '../engine/encode'
import { closeInputBitmaps } from '../engine/engine'
import { orientedSize } from '../engine/orient'
import type { Transform } from '../engine/pipeline'
import type { MarkResources } from '../lib/mark-resources'
import { specForPhoto } from '../lib/spec-tokens'

export interface BulkSettings {
  output: EncodeOptions
  /** Downscale so the longest side is at most this many pixels; `null` keeps the size. */
  fitLongestSide: number | null
  /** One orientation for every photo in the batch; straighten is not offered in bulk. */
  orientation: Pick<Orientation, 'turns' | 'flipX' | 'flipY'>
  /** One colour adjustment for every photo in the batch. */
  adjust: Adjustments
}

/** Builds the transform every photo in a batch shares (orientation, resize, adjustments). */
function bulkTransform(
  sourceSize: { width: number; height: number },
  settings: BulkSettings,
): Transform | undefined {
  const orientation: Orientation = { ...settings.orientation, straighten: 0 }
  const orientedSourceSize = orientedSize(sourceSize, orientation)
  const target =
    settings.fitLongestSide === null
      ? orientedSourceSize
      : fitLongestSide(orientedSourceSize, settings.fitLongestSide)
  const transform: Transform = {}
  if (!isIdentityOrientation(orientation)) {
    transform.orientation = orientation
  }
  if (!isSameSize(target, orientedSourceSize)) {
    transform.resize = target
  }
  if (!isIdentityAdjustments(settings.adjust)) {
    transform.adjust = settings.adjust
  }
  return Object.keys(transform).length === 0 ? undefined : transform
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
    specs: readonly WatermarkSpec[],
    settings: BulkSettings,
    signal: AbortSignal,
  ): Promise<BulkResult> {
    if (isAborted(signal)) {
      throw new CancelledError()
    }
    const [source, inputs] = await Promise.all([
      decode(file),
      this.#resources.resolve(specs.map((spec) => specForPhoto(spec, file))),
    ])
    if (isAborted(signal)) {
      closeInputBitmaps({ ...inputs, source, output: settings.output })
      throw new CancelledError()
    }
    const sourceSize = { width: source.width, height: source.height }
    const transform = bulkTransform(sourceSize, settings)
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
