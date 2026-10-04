import { AudioBufferSource, BufferTarget, Output, WavOutputFormat } from 'mediabunny'

/** Real PCM fixtures exercise stereo/surround decoding and non-output sample rates. */
export async function encodeTestAudio(channels = 2, sampleRate = 44_100): Promise<Blob> {
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })
  const source = new AudioBufferSource({ codec: 'pcm-s16' })
  output.addAudioTrack(source)
  await output.start()
  const buffer = new AudioBuffer({ numberOfChannels: channels, sampleRate, length: sampleRate })
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let frame = 0; frame < data.length; frame += 1)
      data[frame] = Math.sin((frame / sampleRate) * 2 * Math.PI * 440) * 0.25
  }
  await source.add(buffer)
  await output.finalize()
  if (output.target.buffer === null) throw new Error('PCM fixture is missing.')
  return new Blob([output.target.buffer], { type: 'audio/wav' })
}
