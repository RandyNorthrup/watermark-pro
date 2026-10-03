import { describe, expect, it } from 'vitest'

import type { ProjectMediaAsset, VideoProjectAsset } from './project-media'
import { originalProjectSource, projectAudioPlan } from './project-plan'
import {
  appendProjectClip,
  editProjectClip,
  emptyVideoProject,
  unlinkProjectAudio,
  type ClipEdit,
} from '../../shared/video-project'

const asset: VideoProjectAsset = {
  id: 'source',
  kind: 'video',
  file: new File(['bytes'], 'camera.mp4'),
  url: 'blob:camera',
  poster: 'blob:poster',
  map: { width: 1, height: 1, values: new Float32Array([0.5]) },
  probe: { width: 640, height: 360, durationSeconds: 10, videoCodec: 'avc', audioCodec: 'aac' },
}
function timeline(hasAudio = true) {
  return appendProjectClip(emptyVideoProject('Source', 640, 360), {
    id: asset.id,
    kind: 'video',
    duration: 10,
    hasAudio,
  })
}

describe('project export decisions', () => {
  it('copies compatible camera audio and refuses unsupported audio conversion without losing sound', () => {
    expect(projectAudioPlan(timeline(), 'mp4', false, asset)).toEqual({
      mode: 'copy',
      codec: 'aac',
    })
    expect(() => projectAudioPlan(timeline(), 'webm', false, asset)).toThrow(
      'cannot encode edited audio',
    )
    expect(projectAudioPlan(timeline(), 'webm', true, asset)).toMatchObject({
      mode: 'reencode',
      codec: 'opus',
    })
  })
  it('preserves unchanged picture and source audio, including video-only files', () => {
    expect(originalProjectSource(timeline(), [asset])).toBe(asset)
    const silent: VideoProjectAsset = { ...asset, probe: { ...asset.probe, audioCodec: null } }
    expect(originalProjectSource(timeline(false), [silent])).toBe(silent)
    expect(originalProjectSource(timeline(), [silent])).toBeNull()
    expect(originalProjectSource(timeline(false), [asset])).toBeNull()
  })
  it.each<ClipEdit>([
    { start: 1 },
    { in: 1 },
    { out: 9 },
    { x: 0.3 },
    { y: 0.3 },
    { scale: 0.5 },
    { opacity: 0.5 },
  ])('composes changed picture %j instead of copying original timing', (edit) => {
    const project = timeline()
    const clip = project.clips[0]
    if (clip === undefined) throw new Error('Fixture missing.')
    expect(originalProjectSource(editProjectClip(project, clip.id, edit), [asset])).toBeNull()
  })
  it('requires composition for changed sound, hidden picture, other sources and project dimensions', () => {
    const project = timeline()
    const audio = project.clips[1]
    if (audio === undefined) throw new Error('Sound missing.')
    expect(
      originalProjectSource(editProjectClip(project, audio.id, { gain: 0.5 }), [asset]),
    ).toBeNull()
    expect(originalProjectSource(unlinkProjectAudio(project, audio.id), [asset])).toBeNull()
    expect(
      originalProjectSource({ ...project, mutedAudio: [true, false, false, false] }, [asset]),
    ).toBeNull()
    expect(originalProjectSource({ ...project, hiddenVideo: [true, false] }, [asset])).toBeNull()
    expect(originalProjectSource({ ...project, width: 320 }, [asset])).toBeNull()
    expect(
      originalProjectSource(
        appendProjectClip(project, { id: asset.id, kind: 'video', duration: 10, hasAudio: true }),
        [asset],
      ),
    ).toBeNull()
    expect(originalProjectSource(project, [])).toBeNull()
    const standalone: ProjectMediaAsset = {
      id: asset.id,
      kind: 'audio',
      file: asset.file,
      url: asset.url,
      probe: { durationSeconds: 10, audioCodec: 'aac' },
    }
    expect(originalProjectSource(project, [standalone])).toBeNull()
    expect(originalProjectSource(emptyVideoProject('Empty'), [asset])).toBeNull()
  })
  it('encodes audible edits and refuses unsupported sound; mute and zero gain are silent by choice', () => {
    const project = timeline()
    expect(projectAudioPlan(project, 'mp4', true)).toMatchObject({ mode: 'reencode', codec: 'aac' })
    expect(projectAudioPlan(project, 'webm', true)).toMatchObject({
      mode: 'reencode',
      codec: 'opus',
    })
    expect(() => projectAudioPlan(project, 'mp4', false)).toThrow('cannot encode edited audio')
    expect(
      projectAudioPlan({ ...project, mutedAudio: [true, false, false, false] }, 'mp4', false),
    ).toEqual({ mode: 'none' })
    const audio = project.clips[1]
    if (audio === undefined) throw new Error('Sound missing.')
    expect(projectAudioPlan(editProjectClip(project, audio.id, { gain: 0 }), 'mp4', false)).toEqual(
      { mode: 'none' },
    )
    expect(projectAudioPlan(timeline(false), 'mp4', false)).toEqual({ mode: 'none' })
  })
})
