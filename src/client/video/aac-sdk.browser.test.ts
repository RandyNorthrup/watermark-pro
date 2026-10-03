import { describe, expect, it } from 'vitest'

import { readSdkAudio, type ReadMode, type SdkAudioReport } from './test-support/aac-sdk-reader'
import mono from '../../../e2e/fixtures/aac-mono-44100.m4a?url'
import gap from '../../../e2e/fixtures/aac-mono-gap-44100.m4a?url'
import stereo from '../../../e2e/fixtures/aac-stereo-48000.m4a?url'

const NATIVE_TIMEOUT = 30_000
const FIXTURES = [
  { name: 'mono 44.1 kHz', url: mono, rate: 44_100, channels: 1, hasGap: false },
  { name: 'stereo 48 kHz', url: stereo, rate: 48_000, channels: 2, hasGap: false },
  { name: 'mono timestamp gap', url: gap, rate: 44_100, channels: 1, hasGap: true },
]
async function inWorker(buffer: ArrayBuffer, mode: ReadMode): Promise<SdkAudioReport> {
  const worker = new Worker(new URL('test-support/aac-sdk-worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    return await new Promise<SdkAudioReport>((resolve, reject) => {
      worker.addEventListener(
        'message',
        (event: MessageEvent<{ report: SdkAudioReport } | { error: string }>) => {
          if ('error' in event.data) reject(new Error(event.data.error))
          else resolve(event.data.report)
        },
        { once: true },
      )
      worker.addEventListener('error', (event) => reject(new Error(event.message)), { once: true })
      worker.postMessage({ buffer, mode }, [buffer])
    })
  } finally {
    worker.terminate()
  }
}
for (const context of [
  { name: 'page', read: readSdkAudio },
  { name: 'Worker', read: inWorker },
]) {
  describe(`actual patched AAC SDK in ${context.name}`, () => {
    it.each(FIXTURES)(
      'preserves $name input and presentation on a forward native clock',
      async (fixture) => {
        const response = await fetch(fixture.url)
        expect(response.ok).toBe(true)
        const report = await context.read(await response.arrayBuffer(), 'complete')
        expect(report.rate).toBe(fixture.rate)
        expect(report.channels).toBe(fixture.channels)
        expect(report.originalFirst).toBeLessThan(0)
        expect(report.nativeFirst).toBe(0)
        expect(report.decodedFirst).toBeCloseTo(report.originalFirst, 5)
        expect(report.nativeDeltas.length).toBe(report.originalDeltas.length)
        for (const [index, delta] of report.nativeDeltas.entries())
          expect(delta).toBeCloseTo(report.originalDeltas[index] ?? NaN, 5)
        expect(report.activeRms).toBeGreaterThan(0.1)
        expect(report.silentRms).toBeLessThan(0.01)
        expect(report.maximumGap > 0.9).toBe(fixture.hasGap)
        expect(report.hasClosed).toBe(true)
        expect(report.error).toBeNull()
      },
      NATIVE_TIMEOUT,
    )
    it.each(['cancel', 'error'] as const)(
      'closes the actual native decoder after %s',
      async (mode) => {
        const response = await fetch(mono)
        const report = await context.read(await response.arrayBuffer(), mode)
        expect(report.originalFirst).toBeLessThan(0)
        expect(report.nativeFirst).toBe(0)
        expect(report.hasClosed).toBe(true)
        if (mode === 'error') expect(report.error).toContain('Synthetic SDK native decoder failure')
        else expect(report.error).toBeNull()
      },
      NATIVE_TIMEOUT,
    )
  })
}
