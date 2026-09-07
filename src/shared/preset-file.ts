/**
 * Portable preset bundle (`.wmp.json`): the schema for a file that carries a
 * set of watermark presets and the logo bytes their image marks reference, so
 * a library can be moved between organizations or shared. DOM-free and shared
 * by the browser (which reads and writes the file) and any consumer that needs
 * the wire shape; the base64 encode/decode and File plumbing live in the
 * client module, not here.
 */
import { z } from 'zod'

import { presetNameSchema } from './api'
import {
  LOGO_CONTENT_TYPES,
  MAX_PRESET_FILE_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  PRESET_FILE_FORMAT,
  PRESET_FILE_VERSION,
} from './constants'
import { watermarkSpecSchema } from './watermark'

/**
 * A logo embedded in the bundle: its bytes base64-encoded, plus the metadata
 * an upload needs. The name and dimensions mirror `assetUploadFieldsSchema`
 * so an embedded logo re-uploads without further coercion.
 */
const embeddedLogoSchema = z.object({
  name: z.string().trim().min(1).max(MAX_PRESET_NAME_LENGTH),
  contentType: z.enum(LOGO_CONTENT_TYPES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The logo file's bytes, base64-encoded. Size is bounded by the client before decode. */
  base64: z.string().min(1),
})

export type EmbeddedLogo = z.infer<typeof embeddedLogoSchema>

/** One preset in the bundle: its name, its spec, and (for image marks) its logo. */
const presetFileEntrySchema = z.object({
  name: presetNameSchema,
  spec: watermarkSpecSchema,
  logo: embeddedLogoSchema.optional(),
})

export type PresetFileEntry = z.infer<typeof presetFileEntrySchema>

export const presetFileSchema = z.object({
  format: z.literal(PRESET_FILE_FORMAT),
  version: z.literal(PRESET_FILE_VERSION),
  exportedAt: z.iso.datetime(),
  presets: z.array(presetFileEntrySchema).max(MAX_PRESET_FILE_PRESETS),
})

export type PresetFile = z.infer<typeof presetFileSchema>

/** The first suffix a collision gets; names then read "… (2)", "… (3)", and so on. */
const FIRST_COLLISION_SUFFIX = 2

/**
 * Returns `name` unchanged when it does not clash with `existing`, otherwise
 * the same name with the lowest " (n)" suffix (starting at 2) that is unique.
 * Pure; the caller supplies the names already taken.
 */
export function collisionRename(name: string, existing: readonly string[]): string {
  if (!existing.includes(name)) {
    return name
  }
  let suffix = FIRST_COLLISION_SUFFIX
  let candidate = `${name} (${String(suffix)})`
  while (existing.includes(candidate)) {
    suffix += 1
    candidate = `${name} (${String(suffix)})`
  }
  return candidate
}
