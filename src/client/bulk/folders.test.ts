import { describe, expect, it } from 'vitest'

import {
  collectImages,
  type FileSystemEntryLike,
  MAX_BULK_FILES,
  readEntries,
  zipPath,
} from './folders'

function fileEntry(name: string, fullPath: string, type = 'image/png'): FileSystemEntryLike {
  const file = new File([new Uint8Array([1])], name, { type })
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (onSuccess) => {
      onSuccess(file)
    },
  }
}

function dirEntry(
  name: string,
  fullPath: string,
  children: FileSystemEntryLike[],
): FileSystemEntryLike {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let isServed = false
      return {
        readEntries: (onSuccess) => {
          onSuccess(isServed ? [] : children)
          isServed = true
        },
      }
    },
  }
}

function fileWithPath(name: string, relativePath: string, type = 'image/png'): File {
  const file = new File([new Uint8Array([1])], name, { type })
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
  return file
}

describe('readEntries', () => {
  it('flattens a nested tree, keeps paths and counts skipped non-images', async () => {
    const tree = [
      dirEntry('trip', '/trip', [
        fileEntry('a.png', '/trip/a.png'),
        dirEntry('sub', '/trip/sub', [
          fileEntry('b.png', '/trip/sub/b.png'),
          fileEntry('notes.txt', '/trip/sub/notes.txt', 'text/plain'),
        ]),
      ]),
    ]
    const scan = await readEntries(tree)
    expect(scan.files.map((entry) => entry.relativePath)).toEqual(['trip/a.png', 'trip/sub/b.png'])
    expect(scan.skipped).toBe(1)
  })

  it('ignores a file entry with no reader and a directory with no reader', async () => {
    const noReader: FileSystemEntryLike = { isFile: true, isDirectory: false, name: 'x.png' }
    const emptyDir: FileSystemEntryLike = { isFile: false, isDirectory: true, name: 'd' }
    const scan = await readEntries([noReader, emptyDir])
    expect(scan.files).toEqual([])
  })

  it('skips a file entry that cannot be read', async () => {
    const unreadable: FileSystemEntryLike = {
      isFile: true,
      isDirectory: false,
      name: 'x.png',
      fullPath: '/x.png',
      file: (_onSuccess, onError) => {
        onError(new Error('cannot read'))
      },
    }
    const scan = await readEntries([unreadable])
    expect(scan.files).toEqual([])
    expect(scan.skipped).toBe(0)
  })

  it('stops at the batch cap', async () => {
    const many = Array.from({ length: MAX_BULK_FILES + 10 }, (_, index) =>
      fileEntry(`p${String(index)}.png`, `/p${String(index)}.png`),
    )
    const scan = await readEntries(many)
    expect(scan.files.length).toBe(MAX_BULK_FILES)
  })
})

describe('zipPath', () => {
  it('keeps the source folder and swaps in the output name', () => {
    expect(zipPath('trip/day1/a.png', 'a-watermarked.jpg')).toBe('trip/day1/a-watermarked.jpg')
    expect(zipPath('loose.png', 'loose-watermarked.jpg')).toBe('loose-watermarked.jpg')
  })
})

describe('collectImages', () => {
  it('keeps images with their relative path and skips others', () => {
    const scan = collectImages([
      fileWithPath('a.png', 'trip/a.png'),
      fileWithPath('notes.txt', 'trip/notes.txt', 'text/plain'),
      new File([new Uint8Array([1])], 'loose.jpg', { type: 'image/jpeg' }),
    ])
    expect(scan.files.map((entry) => entry.relativePath)).toEqual(['trip/a.png', 'loose.jpg'])
    expect(scan.skipped).toBe(1)
  })
})
