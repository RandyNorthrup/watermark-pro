/**
 * Message protocol between the main thread and the video transcode worker.
 * In its own module so both sides share one definition and the worker file
 * stays free of main-thread imports (mirrors `engine/protocol.ts`).
 */
import type { TranscodePlan } from './plan'
import type { FontResource, MarkInput } from '../engine/protocol'

export interface TranscodeStartMessage {
  type: 'transcode'
  id: number
  /** The source video; structured-cloned to the worker. */
  source: Blob
  /** Resolved marks; each `image` bitmap is transferred and closed in the worker. */
  marks: MarkInput[]
  fonts: FontResource[]
  plan: TranscodePlan
}

export interface CancelRequestMessage {
  type: 'cancel'
  id: number
}

export type VideoWorkerRequest = TranscodeStartMessage | CancelRequestMessage

export interface ProgressMessage {
  type: 'progress'
  id: number
  frames: number
  /** Presentation time of the latest encoded frame, in seconds. */
  timestamp: number
}

export interface TranscodeDoneMessage {
  type: 'done'
  id: number
  blob: Blob
}

export interface TranscodeCancelledMessage {
  type: 'cancelled'
  id: number
}

export interface TranscodeFailedMessage {
  type: 'failed'
  id: number
  message: string
}

export type VideoWorkerResponse =
  ProgressMessage | TranscodeDoneMessage | TranscodeCancelledMessage | TranscodeFailedMessage
