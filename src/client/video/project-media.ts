import type { AudioCodec } from 'mediabunny'

import { probeVideo, sampleFrame, type VideoProbe } from './probe'
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '../../shared/constants'
import type { LuminanceMap } from '../engine/analysis'
import { analyseSource } from '../engine/pipeline'
import { mainThreadBackend } from '../lib/canvas-backend'

interface MediaAsset {
  id: string
  file: File
  url: string
}
export interface VideoProjectAsset extends MediaAsset {
  kind: 'video'
  probe: VideoProbe
  map: LuminanceMap
  poster: string
}
export interface AudioProjectAsset extends MediaAsset {
  kind: 'audio'
  probe: { durationSeconds: number; audioCodec: AudioCodec }
}
export type ProjectMediaAsset = VideoProjectAsset | AudioProjectAsset
export type ProbedProjectMedia =
  | { kind: 'video'; probe: VideoProbe; map: LuminanceMap; poster: Blob }
  | { kind: 'audio'; probe: AudioProjectAsset['probe'] }

/** Native demuxing decides media kind; declared MIME and filename never decide acceptance. */
export async function probeProjectMedia(file: File): Promise<ProbedProjectMedia> {
  if (file.size > MAX_VIDEO_BYTES) throw new RangeError('Media exceeds the source file limit.')
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    if ((await input.getPrimaryVideoTrack()) !== null) {
      const probe = await probeVideo(file)
      const poster = await sampleFrame(file, 0)
      const bitmap = await createImageBitmap(poster)
      try {
        return {
          kind: 'video',
          probe,
          poster,
          map: analyseSource(bitmap, undefined, mainThreadBackend()),
        }
      } finally {
        bitmap.close()
      }
    }
    const track = await input.getPrimaryAudioTrack()
    const audioCodec = await track?.getCodec()
    if (track === null || audioCodec == null || !(await track.canDecode()))
      throw new Error('This file has no audio or video this browser can decode.')
    const durationSeconds = await input.computeDuration()
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_VIDEO_SECONDS
    )
      throw new RangeError('Audio duration exceeds the source limit.')
    return { kind: 'audio', probe: { durationSeconds, audioCodec } }
  } finally {
    input.dispose()
  }
}

/** Blob URLs are allocated only after account generation and project import checks pass. */
export function createProjectMedia(file: File, media: ProbedProjectMedia): ProjectMediaAsset {
  const base = { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }
  return media.kind === 'video'
    ? { ...base, ...media, poster: URL.createObjectURL(media.poster) }
    : { ...base, ...media }
}

/** Import history retains source media until the whole editor is reset or unmounted. */
export function disposeProjectMedia(asset: ProjectMediaAsset): void {
  URL.revokeObjectURL(asset.url)
  if (asset.kind === 'video') URL.revokeObjectURL(asset.poster)
}
