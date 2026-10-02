import { audioCodecForContainer, type AudioPlan, planAudio, type VideoContainer } from './plan'
import type { ProjectMediaAsset, VideoProjectAsset } from './project-media'
import { AUDIO_REENCODE_BITRATE } from '../../shared/constants'
import type { VideoProject } from '../../shared/video-project'

/** The unchanged single-source path preserves native frame timing and packet-copy audio. */
export function originalProjectSource(
  project: VideoProject,
  assets: readonly ProjectMediaAsset[],
): VideoProjectAsset | null {
  const videos = project.clips.filter((clip) => clip.kind === 'video')
  const clip = videos[0]
  if (clip === undefined || videos.length !== 1) return null
  const asset = assets.find((item) => item.id === clip.assetId)
  if (
    asset?.kind !== 'video' ||
    project.width !== asset.probe.width ||
    project.height !== asset.probe.height ||
    clip.start !== 0 ||
    clip.in !== 0 ||
    clip.out !== asset.probe.durationSeconds ||
    clip.x !== 1 / 2 ||
    clip.y !== 1 / 2 ||
    clip.scale !== 1 ||
    clip.opacity !== 1 ||
    project.hiddenVideo.at(clip.track) === true
  )
    return null
  const audio = project.clips.filter((item) => item.kind === 'audio')
  if (asset.probe.audioCodec === null) return audio.length === 0 ? asset : null
  const sound = audio[0]
  return sound?.linkedVideoId === clip.id &&
    audio.length === 1 &&
    sound.gain === 1 &&
    project.mutedAudio.at(sound.track) !== true
    ? asset
    : null
}

/** Edited audio must be encoded; refusing unsupported sound prevents a silent successful export. */
export function projectAudioPlan(
  project: VideoProject,
  container: VideoContainer,
  canEncode: boolean,
  originalSource: VideoProjectAsset | null = null,
): AudioPlan {
  if (
    project.clips.every(
      (clip) =>
        !(clip.kind === 'audio' && clip.gain > 0) || project.mutedAudio.at(clip.track) === true,
    )
  )
    return { mode: 'none' }
  if (originalSource !== null) {
    const original = planAudio(originalSource.probe.audioCodec, container, canEncode)
    if (original.mode !== 'none') return original
  }
  if (!canEncode)
    throw new Error(
      'This browser cannot encode edited audio. Mute the audio tracks or use a browser with audio encoding support.',
    )
  return {
    mode: 'reencode',
    codec: audioCodecForContainer(container),
    bitrate: AUDIO_REENCODE_BITRATE,
  }
}
