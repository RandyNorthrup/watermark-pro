import { describe, expect, it } from 'vitest'

import {
  appendProjectClip,
  clipEnd,
  editProjectClip,
  emptyVideoProject,
  projectDuration,
  removeProjectClip,
  splitProjectClip,
  unlinkProjectAudio,
  videoProjectSchema,
} from './video-project'

const source = { id: 'camera', kind: 'video', duration: 10, hasAudio: true } as const
function project() {
  return appendProjectClip(emptyVideoProject('Edit'), source)
}

describe('video project editing', () => {
  it('appends picture and linked source audio, preserves gaps and bounds project duration', () => {
    const value = project()
    expect(value.clips).toHaveLength(2)
    expect(projectDuration(value)).toBe(10)
    const next = appendProjectClip(value, { ...source, id: 'second', hasAudio: false })
    expect(next.clips.at(-1)).toMatchObject({ kind: 'video', start: 10, in: 0, out: 10 })
    expect(projectDuration(next)).toBe(20)
    const audio = appendProjectClip(value, {
      id: 'music',
      kind: 'audio',
      duration: 15,
      hasAudio: true,
    })
    expect(audio.clips.at(-1)).toMatchObject({
      kind: 'audio',
      track: 2,
      start: 0,
      linkedVideoId: null,
    })
    expect(projectDuration(audio)).toBe(15)
    expect(projectDuration(emptyVideoProject('Empty'))).toBe(0)
  })
  it('moves and trims linked picture/sound together, supports transforms and separate audio gain', () => {
    const value = project()
    const video = value.clips[0]
    const audio = value.clips[1]
    if (video === undefined || audio === undefined) throw new Error('Missing test clips')
    const edited = editProjectClip(value, video.id, {
      start: 3,
      in: 2,
      out: 7,
      opacity: 0.5,
      scale: 0.5,
      x: 0.3,
    })
    expect(edited.clips.every((clip) => clip.start === 3 && clip.in === 2 && clip.out === 7)).toBe(
      true,
    )
    expect(clipEnd(edited.clips[0] ?? video)).toBe(8)
    expect(editProjectClip(edited, audio.id, { gain: 0.25 }).clips[1]).toMatchObject({ gain: 0.25 })
    expect(() => editProjectClip(value, video.id, { gain: 0 })).toThrow('media type')
    expect(() => editProjectClip(value, audio.id, { scale: 1 })).toThrow('media type')
    expect(() => editProjectClip(value, 'missing', {})).toThrow('existing clip')
    expect(() => editProjectClip(value, video.id, { out: 0 })).toThrow()
  })
  it('splits actual source offsets, keeps linked identities and refuses endpoints or overlap', () => {
    const value = project()
    const clip = value.clips[0]
    if (clip === undefined) throw new Error('Missing test clip')
    const cut = splitProjectClip(value, clip.id, 4)
    expect(
      cut.clips
        .filter((entry) => entry.kind === 'video')
        .map((entry) => [entry.start, entry.in, entry.out]),
    ).toEqual([
      [0, 0, 4],
      [4, 4, 10],
    ])
    expect(
      cut.clips
        .filter((entry) => entry.kind === 'audio')
        .map((entry) => [entry.start, entry.in, entry.out]),
    ).toEqual([
      [0, 0, 4],
      [4, 4, 10],
    ])
    expect(videoProjectSchema.safeParse(cut).success).toBe(true)
    for (const time of [0, 10, -1, 11])
      expect(() => splitProjectClip(value, clip.id, time)).toThrow('inside')
    expect(() => splitProjectClip(value, 'missing', 4)).toThrow()
    const right = cut.clips.find((entry) => entry.kind === 'video' && entry.start === 4)
    if (right === undefined) throw new Error('Missing split clip')
    expect(() => editProjectClip(cut, right.id, { start: 3 })).toThrow('overlap')
    expect(
      editProjectClip(cut, right.id, { track: 1, start: 0 }).clips.find(
        (entry) => entry.id === right.id,
      ),
    ).toMatchObject({ track: 1, start: 0 })
  })
  it('accepts adjacent decimal cuts but refuses an actual overlapping interval', () => {
    const value = appendProjectClip(emptyVideoProject('Decimal cuts'), {
      ...source,
      duration: 2.03,
      hasAudio: false,
    })
    const video = value.clips[0]
    if (video === undefined) throw new Error('Missing decimal clip')
    const cut = splitProjectClip(value, video.id, 0.17)
    expect(videoProjectSchema.safeParse(cut).success).toBe(true)
    const right = cut.clips[1]
    if (right === undefined) throw new Error('Missing right decimal clip')
    expect(() => editProjectClip(cut, right.id, { start: right.start - 0.001 })).toThrow('overlap')
  })
  it('unlinks sound for independent edits and deletes linked selections without orphan audio', () => {
    const value = project()
    const audio = value.clips[1]
    if (audio === undefined) throw new Error('Missing sound')
    expect(removeProjectClip(value, audio.id).clips).toEqual([])
    const unlinked = unlinkProjectAudio(value, audio.id)
    const moved = editProjectClip(unlinked, audio.id, { start: 2, in: 1 })
    expect(moved.clips[0]).toMatchObject({ start: 0, in: 0 })
    const split = splitProjectClip(moved, audio.id, 4)
    expect(split.clips.filter((entry) => entry.kind === 'audio')).toHaveLength(2)
    expect(removeProjectClip(unlinked, audio.id).clips).toHaveLength(1)
    expect(() => removeProjectClip(value, 'missing')).toThrow()
    expect(() => unlinkProjectAudio(unlinked, audio.id)).toThrow('linked audio')
  })
  it('rejects duplicate clips, mismatched links, non-finite values and excessive project duration', () => {
    const value = project()
    expect(
      videoProjectSchema.safeParse({ ...value, clips: [...value.clips, value.clips[0]] }).success,
    ).toBe(false)
    expect(
      videoProjectSchema.safeParse({
        ...value,
        clips: value.clips.map((clip) => (clip.kind === 'audio' ? { ...clip, start: 1 } : clip)),
      }).success,
    ).toBe(false)
    expect(videoProjectSchema.safeParse({ ...value, width: Infinity }).success).toBe(false)
    expect(() => appendProjectClip(value, { ...source, duration: 600 })).toThrow()
  })
})
