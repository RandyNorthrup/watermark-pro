import { beforeEach, describe, expect, it } from 'vitest'

import { launchTarget, setLaunchFiles, takeLaunchFiles } from './launch-files'

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

describe('launchTarget', () => {
  it('routes a single image to the editor', () => {
    expect(launchTarget(1)).toBe('/app/editor')
  })

  it('routes two or more images to the bulk tool', () => {
    expect(launchTarget(2)).toBe('/app/bulk')
    expect(launchTarget(9)).toBe('/app/bulk')
  })

  it('routes an empty launch to the editor', () => {
    expect(launchTarget(0)).toBe('/app/editor')
  })
})

describe('the launch-file buffer', () => {
  beforeEach(() => {
    // Drain any files a previous test left behind so each test starts empty.
    takeLaunchFiles()
  })

  it('returns the files that were set and then empties', () => {
    setLaunchFiles([imageFile('a.png'), imageFile('b.png')])
    expect(takeLaunchFiles().map((file) => file.name)).toEqual(['a.png', 'b.png'])
    expect(takeLaunchFiles()).toEqual([])
  })

  it('replaces the buffer so the most recent launch wins', () => {
    setLaunchFiles([imageFile('first.png')])
    setLaunchFiles([imageFile('second.png')])
    expect(takeLaunchFiles().map((file) => file.name)).toEqual(['second.png'])
  })
})
