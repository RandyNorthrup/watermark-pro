/**
 * Message protocol between the main thread and the watermark worker. Kept in
 * its own module so both sides share one definition and the worker file
 * stays free of main-thread imports.
 */
import type { EncodeOptions } from './encode'
import type { MarkOutcome, Transform } from './pipeline'
import type { WatermarkSpec } from '../../shared/watermark'

export interface FontResource {
  family: string
  weight: number
  /** Same-origin URL of a woff2 file. */
  url: string
}

/** One mark to draw, with the binary resources its spec needs. */
export interface MarkInput {
  spec: WatermarkSpec
  /** Required for `image` marks; transferred to the worker and closed there. */
  image?: ImageBitmap
  /** SVG path data (24×24 viewBox) for `icon` symbols. */
  iconPath?: string
}

export interface ApplyMessage {
  type: 'apply'
  id: number
  source: ImageBitmap
  /** Drawn in order; later marks paint over earlier ones. */
  marks: MarkInput[]
  fonts: FontResource[]
  output: EncodeOptions
  transform?: Transform
}

export interface ApplyDoneMessage {
  type: 'done'
  id: number
  blob: Blob
  width: number
  height: number
  /** One entry per mark, in the order they were given. */
  marks: MarkOutcome[]
}

export interface ApplyFailedMessage {
  type: 'failed'
  id: number
  message: string
}

export type WorkerRequest = ApplyMessage
export type WorkerResponse = ApplyDoneMessage | ApplyFailedMessage
