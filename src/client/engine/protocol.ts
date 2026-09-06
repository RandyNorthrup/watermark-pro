/**
 * Message protocol between the main thread and the watermark worker. Kept in
 * its own module so both sides share one definition and the worker file
 * stays free of main-thread imports.
 */
import type { ResolvedContrast } from './contrast'
import type { EncodeOptions } from './encode'
import type { ApplyResult, Transform } from './pipeline'
import type { WatermarkSpec } from '../../shared/watermark'

export interface FontResource {
  family: string
  weight: number
  /** Same-origin URL of a woff2 file. */
  url: string
}

export interface ApplyMessage {
  type: 'apply'
  id: number
  source: ImageBitmap
  spec: WatermarkSpec
  image?: ImageBitmap
  iconPath?: string
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
  placement: ApplyResult['placement']
  contrast: ResolvedContrast
}

export interface ApplyFailedMessage {
  type: 'failed'
  id: number
  message: string
}

export type WorkerRequest = ApplyMessage
export type WorkerResponse = ApplyDoneMessage | ApplyFailedMessage
