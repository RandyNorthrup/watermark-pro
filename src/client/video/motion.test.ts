import { describe, expect, it } from 'vitest'

import {
  createVideoMotion,
  keyframeTime,
  putVideoKeyframe,
  videoEditingSpecAt,
  videoMotionSchema,
  videoPoseAt,
  videoSpecAt,
} from './motion'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'

describe('video motion', () => {
  it('interpolates positions and uses the shortest rotation across the 180-degree seam', () => {
    const first = { time: 3, x: 0.2, y: 0.3, scale: 0.2, rotation: 170, opacity: 0.8 }
    const second = { time: 7, x: 0.8, y: 0.7, scale: 0.4, rotation: -170, opacity: 0.8 }
    expect(videoPoseAt([], 0)).toBeNull()
    expect(videoPoseAt([first, second], 5)).toEqual({
      x: 0.5,
      y: 0.5,
      scale: 0.30000000000000004,
      rotation: -180,
      opacity: 0.8,
    })
    expect(videoPoseAt([first, second], 4)?.rotation).toBe(175)
    expect(videoPoseAt([first, second], 6)?.rotation).toBe(-175)
    expect(videoPoseAt([first, second], 0)?.x).toBe(0.2)
    expect(videoPoseAt([first, second], 10)?.x).toBe(0.8)
    const motion = putVideoKeyframe(putVideoKeyframe(createVideoMotion(10), second), first)
    expect(motion.keyframes.map((entry) => entry.time)).toEqual([3, 7])
    expect(putVideoKeyframe(motion, { ...first, time: 3.00004, x: 0.9 }).keyframes).toHaveLength(2)
    expect(keyframeTime(3.00004)).toBe(3)
    expect(motion.keyframes[0]?.x).toBe(0.2)
  })

  it('applies start/end and fades without writing fade opacity back into the editable pose', () => {
    const spec = { ...DEFAULT_TEXT_SPEC, style: { ...DEFAULT_TEXT_SPEC.style, opacity: 0.8 } }
    const motion = { ...createVideoMotion(10), start: 1, end: 9, fadeIn: 2, fadeOut: 2 }
    expect(videoSpecAt(spec, null, 3)).toBe(spec)
    expect(videoSpecAt(spec, motion, 0).style.opacity).toBe(0)
    expect(videoSpecAt(spec, motion, 1).style.opacity).toBe(0)
    expect(videoSpecAt(spec, motion, 2).style.opacity).toBeCloseTo(0.4)
    expect(videoSpecAt(spec, motion, 5).style.opacity).toBeCloseTo(0.8)
    expect(videoSpecAt(spec, motion, 8).style.opacity).toBeCloseTo(0.4)
    expect(videoSpecAt(spec, motion, 9).style.opacity).toBe(0)
    const keyed = putVideoKeyframe(motion, {
      time: 0,
      x: 0.2,
      y: 0.3,
      scale: 0.25,
      opacity: 0.6,
      rotation: 30,
    })
    expect(videoSpecAt(spec, keyed, 2).style.opacity).toBeCloseTo(0.3)
    expect(videoEditingSpecAt(spec, keyed, 2).style.opacity).toBeCloseTo(0.6)
    expect(videoEditingSpecAt(spec, keyed, 2).placement).toEqual({ mode: 'custom', x: 0.2, y: 0.3 })
    expect(videoMotionSchema.safeParse({ ...motion, end: 1 }).success).toBe(false)
    expect(videoMotionSchema.safeParse({ ...motion, fadeIn: 8, fadeOut: 8 }).success).toBe(false)
    expect(
      videoMotionSchema.safeParse({ ...keyed, keyframes: [...keyed.keyframes, ...keyed.keyframes] })
        .success,
    ).toBe(false)
    expect(videoMotionSchema.safeParse({ ...motion, fadeIn: -1 }).success).toBe(false)
  })
})
