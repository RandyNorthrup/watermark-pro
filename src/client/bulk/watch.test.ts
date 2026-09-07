import { describe, expect, it } from 'vitest'

import { diffScans, scanDirectory, sweepFolder, type ScanEntry, type SweepReport } from './watch'
import { FakeDirectory, imageFile } from '../test-support/fake-file-system'

const okProcess = (file: File) =>
  Promise.resolve({ fileName: `${file.name}-out`, blob: new Blob([`out:${file.name}`]) })

/** Collects the `wrote`/`failed` names a sweep reports, for assertions. */
function recorder(): { wrote: string[]; failed: string[]; report: SweepReport } {
  const wrote: string[] = []
  const failed: string[] = []
  return {
    wrote,
    failed,
    report: {
      wrote: (name) => {
        wrote.push(name)
      },
      failed: (name) => {
        failed.push(name)
      },
    },
  }
}

describe('scanDirectory', () => {
  it('lists image files and ignores non-images', async () => {
    const directory = new FakeDirectory()
    directory.put('a.png', imageFile('a.png', 1))
    directory.put('notes.txt', new File([new Uint8Array(1)], 'notes.txt', { type: 'text/plain' }))
    const scanned = await scanDirectory(directory)
    expect(scanned.map((item) => item.entry.name)).toEqual(['a.png'])
  })
})

describe('diffScans', () => {
  it('returns only new or changed files', () => {
    const a: ScanEntry = { name: 'a.png', size: 1, lastModified: 1 }
    const b: ScanEntry = { name: 'b.png', size: 1, lastModified: 1 }
    const aChanged: ScanEntry = { name: 'a.png', size: 1, lastModified: 2 }
    expect(diffScans([a], [a, b])).toEqual([b])
    expect(diffScans([a], [aChanged])).toEqual([aChanged])
    expect(diffScans([a, b], [a, b])).toEqual([])
  })
})

describe('sweepFolder', () => {
  it('writes new files, reports each result, and returns them as seen', async () => {
    const input = new FakeDirectory()
    const output = new FakeDirectory()
    input.put('a.png', imageFile('a.png', 1))
    const rec = recorder()

    const seen = await sweepFolder(input, output, [], okProcess, rec.report)

    expect(rec.wrote).toEqual(['a.png-out'])
    expect(rec.failed).toEqual([])
    expect(output.written.has('a.png-out')).toBe(true)
    expect(seen.map((entry) => entry.name)).toEqual(['a.png'])
  })

  it('skips files already seen and processes only the newly added one', async () => {
    const input = new FakeDirectory()
    const output = new FakeDirectory()
    input.put('a.png', imageFile('a.png', 1))
    const first = await sweepFolder(input, output, [], okProcess, recorder().report)

    input.put('b.png', imageFile('b.png', 5))
    const rec = recorder()
    await sweepFolder(input, output, first, okProcess, rec.report)

    expect(rec.wrote).toEqual(['b.png-out'])
  })

  it('reports a single file’s failure without stopping the sweep', async () => {
    const input = new FakeDirectory()
    const output = new FakeDirectory()
    input.put('bad.png', imageFile('bad.png', 1))
    input.put('good.png', imageFile('good.png', 1))
    const rec = recorder()

    await sweepFolder(
      input,
      output,
      [],
      (file) => (file.name.startsWith('bad') ? Promise.reject(new Error('nope')) : okProcess(file)),
      rec.report,
    )

    expect(rec.failed).toEqual(['bad.png'])
    expect(rec.wrote).toEqual(['good.png-out'])
  })
})
