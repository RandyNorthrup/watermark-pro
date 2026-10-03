import { describe, expect, it } from 'vitest'

import { aacPcmBlocks } from './aac-pcm'
import { AAC_TIMING_POLICY } from '../../shared/constants'

const FRAME = AAC_TIMING_POLICY.packetFrames
describe('AAC PCM submission boundaries', () => {
  it('preserves both distinct channels and sample order across complete access-unit inputs', () => {
    const frames = FRAME * 4
    const data = Float32Array.from({ length: frames * 2 }, (_, index) => index + 1)
    const offset = FRAME * 8
    const blocks = [...aacPcmBlocks(data, offset)]
    expect(blocks).toHaveLength(4)
    for (const [index, block] of blocks.entries()) {
      expect(block.offset).toBe(offset + index * FRAME)
      expect(block.data.length).toBe(FRAME * 2)
      expect(block.data.subarray(0, FRAME)).toEqual(
        data.subarray(index * FRAME, (index + 1) * FRAME),
      )
      expect(block.data.subarray(FRAME)).toEqual(
        data.subarray(frames + index * FRAME, frames + (index + 1) * FRAME),
      )
      expect(block.data.subarray(0, FRAME)).not.toEqual(block.data.subarray(FRAME))
    }
    expect(data[0]).toBe(1)
    expect(data.at(-1)).toBe(frames * 2)
  })
  it('retains a final partial plane without inventing or dropping samples', () => {
    const frames = FRAME + FRAME / 2
    const data = Float32Array.from({ length: frames * 2 }, (_, index) => index)
    const blocks = [...aacPcmBlocks(data, 0)]
    expect(blocks.map((block) => block.data.length)).toEqual([FRAME * 2, FRAME])
    expect(blocks[1]?.offset).toBe(FRAME)
    expect(blocks[1]?.data.subarray(0, FRAME / 2)).toEqual(data.subarray(FRAME, frames))
    expect(blocks[1]?.data.subarray(FRAME / 2)).toEqual(data.subarray(frames + FRAME))
  })
})
