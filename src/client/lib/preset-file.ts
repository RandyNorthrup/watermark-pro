/**
 * Reading and writing the portable preset bundle in the browser. Export
 * base64-encodes each referenced logo's bytes into the bundle; import decodes
 * them, re-uploads through the existing asset endpoint, rewrites each image
 * preset's `assetId` to the new asset, and creates the presets. The wire shape
 * and the pure helpers live in `src/shared/preset-file.ts`; this module owns
 * the DOM-facing plumbing (base64, `File`, size gates).
 */
import { createWatermark, type LogoUpload, uploadLogo } from './library'
import type { WatermarkDto } from '../../shared/api'
import {
  type LOGO_CONTENT_TYPES,
  MAX_LOGO_BYTES,
  MAX_PRESET_FILE_BYTES,
  PRESET_FILE_FORMAT,
  PRESET_FILE_VERSION,
} from '../../shared/constants'
import {
  type EmbeddedLogo,
  type PresetFile,
  type PresetFileEntry,
  presetFileSchema,
} from '../../shared/preset-file'
import type { WatermarkSpec } from '../../shared/watermark'

/** Bytes per `btoa` call; a bounded spread keeps large logos off the argument-count limit. */
const BASE64_ENCODE_CHUNK = 32_768
/** Base64 packs three bytes into four characters. */
const BASE64_BYTES_PER_GROUP = 3
const BASE64_CHARS_PER_GROUP = 4

/** Failure reading or writing a preset bundle; carries a message the UI can show. */
export class PresetFileError extends Error {
  override readonly name = 'PresetFileError'
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_ENCODE_CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(offset, offset + BASE64_ENCODE_CHUNK))
  }
  return btoa(binary)
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0
  }
  return bytes
}

/** Upper bound on the decoded byte length of a base64 string, from its length alone. */
function decodedByteLength(base64: string): number {
  return Math.floor((base64.length * BASE64_BYTES_PER_GROUP) / BASE64_CHARS_PER_GROUP)
}

/** A logo to embed: the bytes plus the metadata the bundle records. */
export interface ExportLogo {
  assetId: string
  name: string
  contentType: (typeof LOGO_CONTENT_TYPES)[number]
  width: number
  height: number
  bytes: Uint8Array
}

/** A preset to export: only the parts that travel in the bundle. */
export interface ExportPreset {
  name: string
  spec: WatermarkSpec
}

/**
 * Builds a bundle from the chosen presets and the logos their image marks
 * reference. Every image preset must have its logo present in `logos`;
 * a missing one is a programming error in the caller, so it throws.
 */
export function buildPresetFile(
  presets: readonly ExportPreset[],
  logos: readonly ExportLogo[],
): PresetFile {
  const entries = presets.map((preset): PresetFileEntry => {
    const spec = preset.spec
    if (spec.kind !== 'image') {
      return { name: preset.name, spec }
    }
    const assetId = spec.assetId
    const logo = logos.find((candidate) => candidate.assetId === assetId)
    if (logo === undefined) {
      throw new PresetFileError(`No logo was provided for preset "${preset.name}".`)
    }
    return {
      name: preset.name,
      spec,
      logo: {
        name: logo.name,
        contentType: logo.contentType,
        width: logo.width,
        height: logo.height,
        base64: encodeBase64(logo.bytes),
      },
    }
  })
  return {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    presets: entries,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Custom guard so `entry` reads as `unknown`, not the `any[]` `Array.isArray` narrows to. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

/**
 * Rejects a bundle whose embedded logos would decode to more than the logo
 * size limit, before the full parse and before any decode allocates. Walks the
 * raw JSON leniently; anything it cannot read is left for the schema to reject.
 */
function precheckLogoSizes(raw: unknown): void {
  if (!isRecord(raw)) {
    return
  }
  const presets = raw['presets']
  if (!isUnknownArray(presets)) {
    return
  }
  for (const entry of presets) {
    if (!isRecord(entry)) {
      continue
    }
    const logo = entry['logo']
    if (!isRecord(logo)) {
      continue
    }
    const base64 = logo['base64']
    if (typeof base64 === 'string' && decodedByteLength(base64) > MAX_LOGO_BYTES) {
      throw new PresetFileError('A logo embedded in this preset file is larger than the limit.')
    }
  }
}

/**
 * Reads and validates a bundle chosen from disk. The overall size is checked
 * before the file is read; each embedded logo's decoded size is checked before
 * the full schema parse. Throws `PresetFileError` with a message for the UI.
 */
export async function parsePresetFile(file: File): Promise<PresetFile> {
  if (file.size > MAX_PRESET_FILE_BYTES) {
    throw new PresetFileError('This preset file is too large to import.')
  }
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new PresetFileError('This file is not a valid preset file.', { cause: error })
  }
  precheckLogoSizes(raw)
  const result = presetFileSchema.safeParse(raw)
  if (!result.success) {
    throw new PresetFileError('This file is not a Watermark Pro preset file.', {
      cause: result.error,
    })
  }
  return result.data
}

function logoUpload(logo: EmbeddedLogo): LogoUpload {
  // A Uint8Array is a valid File part, but TS 6 lib.dom types BlobPart without
  // it (same cast as zip.ts, PLAN.md §9).
  const file = new File([decodeBase64(logo.base64) as BlobPart], logo.name, {
    type: logo.contentType,
  })
  return { file, name: logo.name, width: logo.width, height: logo.height }
}

/**
 * Imports the chosen bundle entries into the organization. For each image
 * preset the embedded logo is uploaded first and the preset's `assetId`
 * rewritten to the new asset; every preset is then created. Names are used as
 * given, so the caller applies `collisionRename` before selecting. Resolves
 * with the created presets, in order.
 */
export async function importPresetFile(
  organizationId: string,
  selection: readonly PresetFileEntry[],
): Promise<WatermarkDto[]> {
  const created: WatermarkDto[] = []
  for (const entry of selection) {
    const spec = entry.spec
    if (spec.kind === 'image') {
      if (entry.logo === undefined) {
        throw new PresetFileError(`Preset "${entry.name}" is missing its logo image.`)
      }
      const asset = await uploadLogo(organizationId, logoUpload(entry.logo))
      created.push(
        await createWatermark(organizationId, {
          name: entry.name,
          spec: { ...spec, assetId: asset.id },
        }),
      )
    } else {
      created.push(await createWatermark(organizationId, { name: entry.name, spec }))
    }
  }
  return created
}
