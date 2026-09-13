/** Original Lumafoil starter layouts, licensed with the project; they contain no user data or third-party artwork. */
import { DEFAULT_TEXT_SPEC, type TextSpec } from './watermark'

const TEMPLATE_PROFILES = {
  diagonal: { scale: 0.65, rotation: 30, opacity: 0.22, letterSpacing: 0.08, tiled: false },
  stamp: { scale: 0.48, rotation: 0, opacity: 0.6, letterSpacing: 0.08, tiled: false },
  credit: { scale: 0.25, rotation: 0, opacity: 0.85, letterSpacing: 0, tiled: false },
  tiled: { scale: 0.25, rotation: 30, opacity: 0.18, letterSpacing: 0.08, tiled: true },
} as const

const DEFINITIONS = [
  {
    id: 'draft',
    label: 'templates.names.draft',
    category: 'documents',
    text: 'DRAFT',
    profile: 'diagonal',
  },
  {
    id: 'confidential',
    label: 'templates.names.confidential',
    category: 'documents',
    text: 'CONFIDENTIAL',
    profile: 'diagonal',
  },
  {
    id: 'strictly-confidential',
    label: 'templates.names.strictlyConfidential',
    category: 'documents',
    text: 'STRICTLY CONFIDENTIAL',
    profile: 'diagonal',
  },
  {
    id: 'internal-use-only',
    label: 'templates.names.internalUseOnly',
    category: 'documents',
    text: 'INTERNAL USE ONLY',
    profile: 'diagonal',
  },
  {
    id: 'do-not-copy',
    label: 'templates.names.doNotCopy',
    category: 'documents',
    text: 'DO NOT COPY',
    profile: 'diagonal',
  },
  {
    id: 'do-not-distribute',
    label: 'templates.names.doNotDistribute',
    category: 'documents',
    text: 'DO NOT DISTRIBUTE',
    profile: 'diagonal',
  },
  {
    id: 'copy',
    label: 'templates.names.copy',
    category: 'documents',
    text: 'COPY',
    profile: 'stamp',
  },
  {
    id: 'void',
    label: 'templates.names.void',
    category: 'documents',
    text: 'VOID',
    profile: 'diagonal',
  },
  {
    id: 'for-review',
    label: 'templates.names.forReview',
    category: 'review',
    text: 'FOR REVIEW',
    profile: 'diagonal',
  },
  {
    id: 'proof',
    label: 'templates.names.proof',
    category: 'review',
    text: 'PROOF',
    profile: 'diagonal',
  },
  {
    id: 'sample',
    label: 'templates.names.sample',
    category: 'review',
    text: 'SAMPLE',
    profile: 'diagonal',
  },
  {
    id: 'preview',
    label: 'templates.names.preview',
    category: 'review',
    text: 'PREVIEW',
    profile: 'diagonal',
  },
  {
    id: 'approved',
    label: 'templates.names.approved',
    category: 'review',
    text: 'APPROVED',
    profile: 'stamp',
  },
  {
    id: 'final',
    label: 'templates.names.final',
    category: 'review',
    text: 'FINAL',
    profile: 'stamp',
  },
  {
    id: 'unpaid',
    label: 'templates.names.unpaid',
    category: 'documents',
    text: 'UNPAID',
    profile: 'stamp',
  },
  {
    id: 'copyright',
    label: 'templates.names.copyright',
    category: 'photography',
    text: '© Your Name',
    profile: 'credit',
  },
  {
    id: 'photo-credit',
    label: 'templates.names.photoCredit',
    category: 'photography',
    text: 'Photo by Your Name',
    profile: 'credit',
  },
  {
    id: 'repeating-proof',
    label: 'templates.names.repeatingProof',
    category: 'photography',
    text: 'PROOF',
    profile: 'tiled',
  },
] as const

/** Every template is a normal editable spec: the existing engine, offline saves and export paths apply. */
export const WATERMARK_TEMPLATES = DEFINITIONS.map((entry) => {
  const profile = TEMPLATE_PROFILES[entry.profile]
  const spec: TextSpec = {
    ...DEFAULT_TEXT_SPEC,
    text: entry.text,
    fontWeight: 700,
    letterSpacing: profile.letterSpacing,
    placement: { mode: 'anchor', anchor: entry.profile === 'credit' ? 'bottom-right' : 'center' },
    style: {
      ...DEFAULT_TEXT_SPEC.style,
      scale: profile.scale,
      rotation: profile.rotation,
      opacity: profile.opacity,
      tiling: { enabled: profile.tiled, spacing: 1.5 },
    },
  }
  return { id: entry.id, label: entry.label, category: entry.category, spec }
})

export type WatermarkTemplate = (typeof WATERMARK_TEMPLATES)[number]

/** Unknown keys never silently select a different template. */
export function watermarkTemplate(id: string): WatermarkTemplate | undefined {
  return WATERMARK_TEMPLATES.find((template) => template.id === id)
}
