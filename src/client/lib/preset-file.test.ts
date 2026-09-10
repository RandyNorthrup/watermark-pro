import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWatermark, uploadLogo } from './library'
import {
  buildPresetFile,
  type ExportLogo,
  type ExportPreset,
  importPresetFile,
  parsePresetFile,
  PresetFileError,
} from './preset-file'
import type { AssetDto } from '../../shared/api'
import type { WatermarkDto } from '../../shared/api-watermark'
import { MAX_LOGO_BYTES, MAX_PRESET_FILE_BYTES } from '../../shared/constants'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../shared/watermark'

vi.mock('./library', () => ({
  uploadLogo: vi.fn(),
  createWatermark: vi.fn(),
}))

const imageSpec: WatermarkSpec = {
  kind: 'image',
  assetId: 'asset-original',
  placement: { mode: 'smart' },
  contrast: { mode: 'auto' },
  style: DEFAULT_STYLE,
}

function logo(bytes: Uint8Array): ExportLogo {
  return {
    assetId: 'asset-original',
    name: 'logo.png',
    contentType: 'image/png',
    width: 240,
    height: 80,
    bytes,
  }
}

function bytesFromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0)
}

function asset(id: string): AssetDto {
  return {
    id,
    organizationId: 'org-1',
    kind: 'logo',
    name: 'logo.png',
    contentType: 'image/png',
    size: 3,
    width: 240,
    height: 80,
    createdBy: 'user-1',
    createdAt: '2026-09-07T12:00:00.000Z',
  }
}

function watermark(name: string, spec: WatermarkSpec): WatermarkDto {
  return {
    id: `wm-${name}`,
    organizationId: 'org-1',
    name,
    spec,
    createdBy: 'user-1',
    createdAt: '2026-09-07T12:00:00.000Z',
    updatedAt: '2026-09-07T12:00:00.000Z',
  }
}

describe('buildPresetFile', () => {
  it('embeds the referenced logo for image presets and omits logos otherwise', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const presets: ExportPreset[] = [
      { name: 'Text mark', spec: DEFAULT_TEXT_SPEC },
      { name: 'Logo mark', spec: imageSpec },
    ]
    const bundle = buildPresetFile(presets, [logo(bytes)])

    expect(bundle.format).toBe('watermark-pro/presets')
    expect(bundle.version).toBe(1)
    expect(() => new Date(bundle.exportedAt)).not.toThrow()
    expect(bundle.presets[0]?.logo).toBeUndefined()
    const embedded = bundle.presets[1]?.logo
    expect(embedded?.contentType).toBe('image/png')
    expect(embedded && bytesFromBase64(embedded.base64)).toEqual(bytes)
  })

  it('encodes logos larger than one base64 chunk without corruption', () => {
    const bytes = new Uint8Array(32_768 + 137)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 256
    }
    const bundle = buildPresetFile([{ name: 'Big logo', spec: imageSpec }], [logo(bytes)])
    const embedded = bundle.presets[0]?.logo
    expect(embedded && bytesFromBase64(embedded.base64)).toEqual(bytes)
  })

  it('throws when an image preset has no matching logo', () => {
    expect(() => buildPresetFile([{ name: 'Logo mark', spec: imageSpec }], [])).toThrow(
      PresetFileError,
    )
  })
})

describe('parsePresetFile', () => {
  it('round-trips a built bundle through a file', async () => {
    const bytes = new Uint8Array([9, 8, 7])
    const bundle = buildPresetFile(
      [
        { name: 'Text mark', spec: DEFAULT_TEXT_SPEC },
        { name: 'Logo mark', spec: imageSpec },
      ],
      [logo(bytes)],
    )
    const file = new File([JSON.stringify(bundle)], 'library.wmp.json', {
      type: 'application/json',
    })
    await expect(parsePresetFile(file)).resolves.toEqual(bundle)
  })

  it('rejects a file larger than the size limit before reading it', async () => {
    const big = new File([new Uint8Array(MAX_PRESET_FILE_BYTES + 1)], 'big.wmp.json')
    await expect(parsePresetFile(big)).rejects.toThrow(PresetFileError)
  })

  it('rejects a file that is not JSON', async () => {
    const file = new File(['not json {'], 'broken.wmp.json')
    await expect(parsePresetFile(file)).rejects.toThrow(/not a valid preset file/)
  })

  it('rejects a JSON file that is not a preset bundle', async () => {
    const file = new File([JSON.stringify({ format: 'other', presets: [] })], 'x.wmp.json')
    await expect(parsePresetFile(file)).rejects.toThrow(/not a Lumafoil preset file/)
  })

  it('rejects an embedded logo larger than the logo limit before parsing', async () => {
    const oversizedLength = Math.ceil(((MAX_LOGO_BYTES + 1) * 4) / 3)
    const raw = {
      format: 'watermark-pro/presets',
      version: 1,
      exportedAt: '2026-09-07T12:00:00.000Z',
      presets: [
        {
          name: 'Logo mark',
          spec: imageSpec,
          logo: {
            name: 'logo.png',
            contentType: 'image/png',
            width: 240,
            height: 80,
            base64: 'A'.repeat(oversizedLength),
          },
        },
      ],
    }
    const file = new File([JSON.stringify(raw)], 'huge.wmp.json')
    await expect(parsePresetFile(file)).rejects.toThrow(/larger than the limit/)
  })
})

describe('importPresetFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a non-image preset without uploading a logo', async () => {
    vi.mocked(createWatermark).mockResolvedValue(watermark('Text mark', DEFAULT_TEXT_SPEC))
    const created = await importPresetFile('org-1', [
      { name: 'Text mark', spec: DEFAULT_TEXT_SPEC },
    ])

    expect(uploadLogo).not.toHaveBeenCalled()
    expect(createWatermark).toHaveBeenCalledWith('org-1', {
      name: 'Text mark',
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(created).toHaveLength(1)
  })

  it('uploads the embedded logo and rewrites the image preset asset id', async () => {
    const bytes = new Uint8Array([10, 20, 30])
    const bundle = buildPresetFile([{ name: 'Logo mark', spec: imageSpec }], [logo(bytes)])
    vi.mocked(uploadLogo).mockResolvedValue(asset('asset-new'))
    vi.mocked(createWatermark).mockResolvedValue(
      watermark('Logo mark', { ...imageSpec, assetId: 'asset-new' }),
    )

    const created = await importPresetFile('org-1', bundle.presets)

    const uploadCall = vi.mocked(uploadLogo).mock.calls[0]
    expect(uploadCall?.[0]).toBe('org-1')
    const upload = uploadCall?.[1]
    expect(upload?.name).toBe('logo.png')
    expect(upload?.file.type).toBe('image/png')
    const uploaded = new Uint8Array(await upload!.file.arrayBuffer())
    expect(uploaded).toEqual(bytes)

    const watermarkCall = vi.mocked(createWatermark).mock.calls[0]
    expect(watermarkCall?.[1].spec).toMatchObject({ kind: 'image', assetId: 'asset-new' })
    expect(created).toHaveLength(1)
  })

  it('throws when an image preset is missing its logo', async () => {
    await expect(
      importPresetFile('org-1', [{ name: 'Logo mark', spec: imageSpec }]),
    ).rejects.toThrow(PresetFileError)
    expect(uploadLogo).not.toHaveBeenCalled()
  })
})
