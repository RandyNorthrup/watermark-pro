import { describe, expect, it } from 'vitest'

import { imageExtensions, toChooserSelections } from './dropbox-chooser'
import { PHOTO_CONTENT_TYPES } from '../../../shared/constants'

describe('imageExtensions', () => {
  it('offers an extension for every accepted photo type', () => {
    expect(imageExtensions()).toEqual(['.png', '.jpg', '.jpeg', '.webp'])
  })

  it('covers each configured content type', () => {
    const extensions = imageExtensions()
    for (const type of PHOTO_CONTENT_TYPES) {
      const subtype = type.split('/', 2)[1]
      expect(extensions.some((extension) => extension.includes(subtype ?? ''))).toBe(true)
    }
  })

  it('emits only leading-dot extensions with no duplicates', () => {
    const extensions = imageExtensions()
    expect(extensions.every((extension) => extension.startsWith('.'))).toBe(true)
    expect(new Set(extensions).size).toBe(extensions.length)
  })
})

describe('toChooserSelections', () => {
  it('keeps the name and direct link of each chosen file', () => {
    expect(
      toChooserSelections([
        { name: 'sunset.jpg', link: 'https://dl.dropboxusercontent.com/s/a/sunset.jpg' },
      ]),
    ).toEqual([{ name: 'sunset.jpg', link: 'https://dl.dropboxusercontent.com/s/a/sunset.jpg' }])
  })

  it('preserves selection order across multiple files', () => {
    const selections = toChooserSelections([
      { name: 'first.png', link: 'https://dl.dropboxusercontent.com/s/1/first.png' },
      { name: 'second.webp', link: 'https://dl.dropboxusercontent.com/s/2/second.webp' },
      { name: 'third.jpeg', link: 'https://dl.dropboxusercontent.com/s/3/third.jpeg' },
    ])
    expect(selections.map((selection) => selection.name)).toEqual([
      'first.png',
      'second.webp',
      'third.jpeg',
    ])
  })

  it('reads only the name and link, dropping any extra Chooser fields', () => {
    const raw = [
      {
        name: 'photo.png',
        link: 'https://dl.dropboxusercontent.com/s/9/photo.png',
        bytes: 1024,
        icon: 'https://www.dropbox.com/static/images/icon.png',
        isDir: false,
      },
    ]
    expect(toChooserSelections(raw)).toEqual([
      { name: 'photo.png', link: 'https://dl.dropboxusercontent.com/s/9/photo.png' },
    ])
  })

  it('returns an empty list for an empty selection', () => {
    expect(toChooserSelections([])).toEqual([])
  })
})
