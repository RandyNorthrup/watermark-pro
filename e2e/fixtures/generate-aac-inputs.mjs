import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE = { seconds: 4, amplitude: 0.25, frequency: 440, silentStart: 1.1, silentEnd: 1.4 }
const directory = fileURLToPath(new URL('./', import.meta.url))
const temporary = mkdtempSync(path.join(tmpdir(), 'lumafoil-aac-inputs-'))
try {
  for (const { name, rate, channels, hasGap } of [
    { name: 'aac-mono-44100.m4a', rate: 44_100, channels: 1, hasGap: false },
    { name: 'aac-stereo-48000.m4a', rate: 48_000, channels: 2, hasGap: false },
    { name: 'aac-mono-gap-44100.m4a', rate: 44_100, channels: 1, hasGap: true },
  ]) {
    const frames = rate * FIXTURE.seconds
    const dataBytes = frames * channels * 2
    const wave = Buffer.alloc(44 + dataBytes)
    wave.write('RIFF', 0)
    wave.writeUInt32LE(36 + dataBytes, 4)
    wave.write('WAVEfmt ', 8)
    wave.writeUInt32LE(16, 16)
    wave.writeUInt16LE(1, 20)
    wave.writeUInt16LE(channels, 22)
    wave.writeUInt32LE(rate, 24)
    wave.writeUInt32LE(rate * channels * 2, 28)
    wave.writeUInt16LE(channels * 2, 32)
    wave.writeUInt16LE(16, 34)
    wave.write('data', 36)
    wave.writeUInt32LE(dataBytes, 40)
    for (let frame = 0; frame < frames; frame += 1) {
      const time = frame / rate
      for (let channel = 0; channel < channels; channel += 1) {
        const value =
          time >= FIXTURE.silentStart && time < FIXTURE.silentEnd
            ? 0
            : FIXTURE.amplitude * Math.sin(2 * Math.PI * FIXTURE.frequency * (channel + 1) * time)
        wave.writeInt16LE(Math.round(value * 32_767), 44 + (frame * channels + channel) * 2)
      }
    }
    const source = path.join(temporary, `${name}.wav`)
    writeFileSync(source, wave)
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      source,
      ...(hasGap ? ['-af', String.raw`asetpts=PTS+gte(T\,2)*1/TB`] : []),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-threads',
      '1',
      path.join(directory, name),
    ])
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
