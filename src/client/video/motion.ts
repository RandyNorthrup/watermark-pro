import { z } from 'zod'

import { MAX_VIDEO_SECONDS } from '../../shared/constants'
import { MAX_ROTATION_DEGREES, styleSchema, type WatermarkSpec } from '../../shared/watermark'

export const VIDEO_MOTION_LIMITS = { keyframes: 100, timePrecision: 1000 } as const
const FULL_TURN = MAX_ROTATION_DEGREES * 2
const seconds = z.number().min(0).max(MAX_VIDEO_SECONDS)
const unit = z.number().min(0).max(1)

export const videoKeyframeSchema = styleSchema
  .pick({ scale: true, rotation: true, opacity: true })
  .extend({
    time: seconds,
    x: unit,
    y: unit,
  })
export const videoMotionSchema = z
  .object({
    start: seconds,
    end: seconds,
    fadeIn: seconds,
    fadeOut: seconds,
    keyframes: z.array(videoKeyframeSchema).max(VIDEO_MOTION_LIMITS.keyframes),
  })
  .superRefine((value, context) => {
    if (value.end <= value.start)
      context.addIssue({ code: 'custom', message: 'End must follow Start.', path: ['end'] })
    if (
      value.fadeIn + value.fadeOut >
      value.end - value.start + 1 / VIDEO_MOTION_LIMITS.timePrecision
    )
      context.addIssue({
        code: 'custom',
        message: 'Fades must fit inside the visible interval.',
        path: ['fadeOut'],
      })
    for (let index = 1; index < value.keyframes.length; index += 1) {
      const current = value.keyframes[index]
      const previous = value.keyframes[index - 1]
      if (current !== undefined && previous !== undefined && current.time <= previous.time)
        context.addIssue({
          code: 'custom',
          message: 'Keyframes must have distinct increasing times.',
          path: ['keyframes', index, 'time'],
        })
    }
  })

export type VideoKeyframe = z.infer<typeof videoKeyframeSchema>
export type VideoMotion = z.infer<typeof videoMotionSchema>
export type VideoPose = Omit<VideoKeyframe, 'time'>

/** Timeline times are stored at millisecond precision so repeated edits replace the same point. */
export function keyframeTime(time: number): number {
  return Math.round(time * VIDEO_MOTION_LIMITS.timePrecision) / VIDEO_MOTION_LIMITS.timePrecision
}

/** Creates an explicit visible interval; static marks need no position keyframes. */
export function createVideoMotion(duration: number): VideoMotion {
  return videoMotionSchema.parse({ start: 0, end: duration, fadeIn: 0, fadeOut: 0, keyframes: [] })
}

/** Insert or replace a pose without duplicating a timestamp. */
export function putVideoKeyframe(motion: VideoMotion, frame: VideoKeyframe): VideoMotion {
  const next = videoKeyframeSchema.parse({ ...frame, time: keyframeTime(frame.time) })
  return videoMotionSchema.parse({
    ...motion,
    keyframes: [...motion.keyframes.filter((entry) => entry.time !== next.time), next].toSorted(
      (a, b) => a.time - b.time,
    ),
  })
}

/** Wrap angles consistently and interpolate across the shortest turn, including the ±180° seam. */
function angle(value: number): number {
  return (
    ((((value + MAX_ROTATION_DEGREES) % FULL_TURN) + FULL_TURN) % FULL_TURN) - MAX_ROTATION_DEGREES
  )
}

/** Pose at a media timestamp; keyframes hold before/after their endpoints. */
export function videoPoseAt(keyframes: readonly VideoKeyframe[], time: number): VideoPose | null {
  const first = keyframes[0]
  if (first === undefined) return null
  let previous = first
  for (const next of keyframes) {
    if (time <= next.time) {
      const ratio =
        next.time === previous.time
          ? 0
          : Math.max(0, Math.min(1, (time - previous.time) / (next.time - previous.time)))
      const mix = (start: number, end: number) => start + (end - start) * ratio
      return {
        x: mix(previous.x, next.x),
        y: mix(previous.y, next.y),
        scale: mix(previous.scale, next.scale),
        opacity: mix(previous.opacity, next.opacity),
        rotation: angle(previous.rotation + angle(next.rotation - previous.rotation) * ratio),
      }
    }
    previous = next
  }
  return {
    x: previous.x,
    y: previous.y,
    scale: previous.scale,
    rotation: previous.rotation,
    opacity: previous.opacity,
  }
}

/** Current editable pose excludes fade gain, so a fade cannot overwrite the layer's opacity. */
export function videoEditingSpecAt(
  spec: WatermarkSpec,
  motion: VideoMotion | null | undefined,
  time: number,
): WatermarkSpec {
  const pose = videoPoseAt(motion?.keyframes ?? [], time)
  if (pose === null) return spec
  return {
    ...spec,
    placement: { mode: 'custom', x: pose.x, y: pose.y },
    style: { ...spec.style, scale: pose.scale, rotation: pose.rotation, opacity: pose.opacity },
  }
}

/** The same interpolation and fade envelope drive the viewer and every exported video frame. */
export function videoSpecAt(
  spec: WatermarkSpec,
  motion: VideoMotion | null | undefined,
  time: number,
): WatermarkSpec {
  if (motion == null) return spec
  let gain = 0
  if (time >= motion.start && time < motion.end) {
    const fadeIn = motion.fadeIn === 0 ? 1 : (time - motion.start) / motion.fadeIn
    const fadeOut = motion.fadeOut === 0 ? 1 : (motion.end - time) / motion.fadeOut
    gain = Math.max(0, Math.min(1, fadeIn, fadeOut))
  }
  const result = videoEditingSpecAt(spec, motion, time)
  return { ...result, style: { ...result.style, opacity: result.style.opacity * gain } }
}
