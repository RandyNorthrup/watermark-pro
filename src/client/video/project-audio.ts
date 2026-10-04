import { AudioSample, AudioSampleSink, AudioSampleSource, Quality } from 'mediabunny'
import type { Input, Output } from 'mediabunny'

import { createTimedAacSource, type AacTiming } from './aac-source'
import { CancelledError } from './errors'
import type { TranscodePlan } from './plan'
import { AUDIO_REENCODE_BITRATE, VIDEO_PROJECT_LIMITS } from '../../shared/constants'
import { clipEnd, type ProjectAudioClip, type VideoProject } from '../../shared/video-project'

interface AudioCursor {
  clip: ProjectAudioClip
  samples: AsyncGenerator<AudioSample, void, unknown>
  current: AudioSample | null
  channels: Float32Array[]
  ended: boolean
}

/** Prepared track setup plus explicit draining and cancellation of native audio resources. */
export interface PreparedProjectAudio {
  drain(): Promise<AacTiming | null>
  cancel(): Promise<void>
}

function check(signal: AbortSignal) {
  if (signal.aborted) throw new CancelledError()
}

async function mixCursor(
  cursor: AudioCursor,
  data: Float32Array,
  offset: number,
  frames: number,
  signal: AbortSignal,
) {
  const { sampleRate, channels } = VIDEO_PROJECT_LIMITS
  const end = (offset + frames) / sampleRate
  while (!cursor.ended) {
    check(signal)
    if (cursor.current === null) {
      const next = await cursor.samples.next()
      if (next.done === true) {
        cursor.ended = true
        return
      }
      cursor.current = next.value
      cursor.channels = Array.from({ length: next.value.numberOfChannels }, (_, planeIndex) => {
        const plane = new Float32Array(next.value.numberOfFrames)
        next.value.copyTo(plane, { planeIndex, format: 'f32-planar' })
        return plane
      })
    }
    const sample = cursor.current
    const start = cursor.clip.start + sample.timestamp - cursor.clip.in
    if (start >= end) return
    const firstTime = Math.max(start, cursor.clip.start)
    const first = Math.max(0, Math.ceil(firstTime * sampleRate - offset))
    const lastTime = Math.min(start + sample.duration, clipEnd(cursor.clip))
    const last = Math.min(frames, Math.ceil(lastTime * sampleRate - offset))
    for (let frame = first; frame < last; frame += 1) {
      const position = ((offset + frame) / sampleRate - start) * sample.sampleRate
      const left = Math.max(0, Math.min(sample.numberOfFrames - 1, Math.floor(position)))
      const right = Math.min(sample.numberOfFrames - 1, left + 1)
      const fraction = position - Math.floor(position)
      for (let channel = 0; channel < channels; channel += 1) {
        const plane = cursor.channels[Math.min(channel, cursor.channels.length - 1)]
        if (plane === undefined) throw new Error('Decoded audio has no channels.')
        let value = (plane[left] ?? 0) * (1 - fraction) + (plane[right] ?? 0) * fraction
        // Preserve additional surround channels in both stereo outputs.
        for (const extra of cursor.channels.slice(channels))
          value += ((extra[left] ?? 0) * (1 - fraction) + (extra[right] ?? 0) * fraction) / channels
        const index = channel * frames + frame
        data[index] = (data[index] ?? 0) + value * cursor.clip.gain
      }
    }
    if (start + sample.duration > end) return
    sample.close()
    cursor.current = null
    cursor.channels = []
  }
}

/** Stream bounded stereo blocks, honoring source trims, silence, overlap, gain and track mute. */
export async function encodeProjectAudio(
  project: VideoProject,
  inputs: ReadonlyMap<string, Input>,
  output: Output,
  plan: TranscodePlan,
  duration: number,
  signal: AbortSignal,
): Promise<PreparedProjectAudio | null> {
  const clips = project.clips.filter(
    (clip): clip is ProjectAudioClip =>
      clip.kind === 'audio' && project.mutedAudio.at(clip.track) !== true && clip.gain > 0,
  )
  if (clips.length === 0) return null
  if (plan.audio.mode !== 'reencode')
    throw new Error(
      'Edited audio requires a supported audio encoder. Mute audio to export a silent project.',
    )
  const cursors: AudioCursor[] = []
  for (const clip of clips) {
    check(signal)
    const input = inputs.get(clip.assetId)
    if (input === undefined) throw new Error('Audio source is missing.')
    const track = await input.getPrimaryAudioTrack()
    if (track === null || !(await track.canDecode()))
      throw new Error('This audio track cannot be decoded in this browser.')
    cursors.push({
      clip,
      samples: new AudioSampleSink(track).samples(clip.in, clip.out),
      current: null,
      channels: [],
      ended: false,
    })
  }
  const timed =
    plan.audio.codec === 'aac' ? await createTimedAacSource(output, duration, signal) : null
  const source =
    timed === null
      ? new AudioSampleSource({
          codec: plan.audio.codec,
          quality: new Quality({ bitrate: AUDIO_REENCODE_BITRATE }),
        })
      : null
  if (source !== null) output.addAudioTrack(source)
  return {
    async cancel() {
      await timed?.cancel()
    },
    async drain() {
      const { sampleRate, channels, audioChunkFrames } = VIDEO_PROJECT_LIMITS
      const total = Math.ceil(duration * sampleRate)
      try {
        for (let offset = 0; offset < total; offset += audioChunkFrames) {
          check(signal)
          const frames = Math.min(audioChunkFrames, total - offset)
          const data = new Float32Array(frames * channels)
          for (const cursor of cursors) await mixCursor(cursor, data, offset, frames, signal)
          for (let index = 0; index < data.length; index += 1)
            data[index] = Math.max(-1, Math.min(1, data[index] ?? 0))
          if (timed !== null) {
            await timed.add(data, frames, offset)
            continue
          }
          if (source === null) throw new Error('Project audio encoder is missing.')
          const sample = new AudioSample({
            data,
            format: 'f32-planar',
            sampleRate,
            numberOfChannels: channels,
            timestamp: offset / sampleRate,
          })
          try {
            await source.add(sample)
          } finally {
            sample.close()
          }
        }
        return timed === null ? null : await timed.finish()
      } finally {
        source?.close()
        for (const cursor of cursors) {
          cursor.current?.close()
          await cursor.samples.return()
        }
      }
    },
  }
}
