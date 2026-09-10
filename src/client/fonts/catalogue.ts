/**
 * Font catalogue (PLAN.md M3, R11). Every family is an open-licensed
 * Fontsource package bundled with the app, so no request ever leaves the
 * origin. Styles (the @font-face CSS) are loaded on demand for the page and
 * the latin woff2 file is handed to the engine worker by URL.
 *
 * Generated from each package's metadata.json; `family` is the CSS name
 * ("… Variable" for variable fonts), `weights` are the weights offered in
 * the designer. Static families ship 400 and, when available, 700. The
 * loaders that turn an entry into CSS and a woff2 URL live in `load.ts`.
 */
import extendedFonts from './extended-catalogue.json'

export const FONT_CATEGORIES = ['sans', 'serif', 'display', 'script', 'mono'] as const

export type FontCategory = (typeof FONT_CATEGORIES)[number]

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  script: 'Script and handwriting',
  mono: 'Monospace',
}

export interface FontFamily {
  id: string
  /** Fontsource package that ships the family. */
  packageName: string
  /** CSS font-family name. */
  family: string
  category: FontCategory
  isVariable: boolean
  weights: readonly number[]
  license: string
  /** Vendored, immutable resources for families without a runtime npm package. */
  files?: readonly { weight: number; url: string }[]
  licensePath?: string
}

const BASE_FONTS: readonly FontFamily[] = [
  {
    id: 'abril-fatface',
    packageName: '@fontsource/abril-fatface',
    family: 'Abril Fatface',
    category: 'display',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'alfa-slab-one',
    packageName: '@fontsource/alfa-slab-one',
    family: 'Alfa Slab One',
    category: 'display',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'bangers',
    packageName: '@fontsource/bangers',
    family: 'Bangers',
    category: 'display',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'lobster',
    packageName: '@fontsource/lobster',
    family: 'Lobster',
    category: 'display',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'righteous',
    packageName: '@fontsource/righteous',
    family: 'Righteous',
    category: 'display',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'fira-code',
    packageName: '@fontsource-variable/fira-code',
    family: 'Fira Code Variable',
    category: 'mono',
    isVariable: true,
    weights: [300, 400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'ibm-plex-mono',
    packageName: '@fontsource/ibm-plex-mono',
    family: 'IBM Plex Mono',
    category: 'mono',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'jetbrains-mono',
    packageName: '@fontsource-variable/jetbrains-mono',
    family: 'JetBrains Mono Variable',
    category: 'mono',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'source-code-pro',
    packageName: '@fontsource-variable/source-code-pro',
    family: 'Source Code Pro Variable',
    category: 'mono',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'space-mono',
    packageName: '@fontsource/space-mono',
    family: 'Space Mono',
    category: 'mono',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'anton',
    packageName: '@fontsource/anton',
    family: 'Anton',
    category: 'sans',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'archivo-black',
    packageName: '@fontsource/archivo-black',
    family: 'Archivo Black',
    category: 'sans',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'bebas-neue',
    packageName: '@fontsource/bebas-neue',
    family: 'Bebas Neue',
    category: 'sans',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'dm-sans',
    packageName: '@fontsource-variable/dm-sans',
    family: 'DM Sans Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'figtree',
    packageName: '@fontsource-variable/figtree',
    family: 'Figtree Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'fredoka',
    packageName: '@fontsource-variable/fredoka',
    family: 'Fredoka Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'inter',
    packageName: '@fontsource-variable/inter',
    family: 'Inter Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'josefin-sans',
    packageName: '@fontsource-variable/josefin-sans',
    family: 'Josefin Sans Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'lato',
    packageName: '@fontsource/lato',
    family: 'Lato',
    category: 'sans',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'manrope',
    packageName: '@fontsource-variable/manrope',
    family: 'Manrope Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'montserrat',
    packageName: '@fontsource-variable/montserrat',
    family: 'Montserrat Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'nunito',
    packageName: '@fontsource-variable/nunito',
    family: 'Nunito Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'open-sans',
    packageName: '@fontsource-variable/open-sans',
    family: 'Open Sans Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'oswald',
    packageName: '@fontsource-variable/oswald',
    family: 'Oswald Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'outfit',
    packageName: '@fontsource-variable/outfit',
    family: 'Outfit Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'plus-jakarta-sans',
    packageName: '@fontsource-variable/plus-jakarta-sans',
    family: 'Plus Jakarta Sans Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'poppins',
    packageName: '@fontsource/poppins',
    family: 'Poppins',
    category: 'sans',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'raleway',
    packageName: '@fontsource-variable/raleway',
    family: 'Raleway Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'roboto',
    packageName: '@fontsource-variable/roboto',
    family: 'Roboto Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'work-sans',
    packageName: '@fontsource-variable/work-sans',
    family: 'Work Sans Variable',
    category: 'sans',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'amatic-sc',
    packageName: '@fontsource/amatic-sc',
    family: 'Amatic SC',
    category: 'script',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'caveat',
    packageName: '@fontsource-variable/caveat',
    family: 'Caveat Variable',
    category: 'script',
    isVariable: true,
    weights: [400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'courgette',
    packageName: '@fontsource/courgette',
    family: 'Courgette',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'dancing-script',
    packageName: '@fontsource-variable/dancing-script',
    family: 'Dancing Script Variable',
    category: 'script',
    isVariable: true,
    weights: [400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'great-vibes',
    packageName: '@fontsource/great-vibes',
    family: 'Great Vibes',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'indie-flower',
    packageName: '@fontsource/indie-flower',
    family: 'Indie Flower',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'kaushan-script',
    packageName: '@fontsource/kaushan-script',
    family: 'Kaushan Script',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'pacifico',
    packageName: '@fontsource/pacifico',
    family: 'Pacifico',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'permanent-marker',
    packageName: '@fontsource/permanent-marker',
    family: 'Permanent Marker',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'Apache-2.0',
  },
  {
    id: 'sacramento',
    packageName: '@fontsource/sacramento',
    family: 'Sacramento',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'satisfy',
    packageName: '@fontsource/satisfy',
    family: 'Satisfy',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'Apache-2.0',
  },
  {
    id: 'shadows-into-light',
    packageName: '@fontsource/shadows-into-light',
    family: 'Shadows Into Light',
    category: 'script',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'cinzel',
    packageName: '@fontsource-variable/cinzel',
    family: 'Cinzel Variable',
    category: 'serif',
    isVariable: true,
    weights: [400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'cormorant-garamond',
    packageName: '@fontsource/cormorant-garamond',
    family: 'Cormorant Garamond',
    category: 'serif',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'crimson-text',
    packageName: '@fontsource/crimson-text',
    family: 'Crimson Text',
    category: 'serif',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'dm-serif-display',
    packageName: '@fontsource/dm-serif-display',
    family: 'DM Serif Display',
    category: 'serif',
    isVariable: false,
    weights: [400],
    license: 'OFL-1.1',
  },
  {
    id: 'eb-garamond',
    packageName: '@fontsource-variable/eb-garamond',
    family: 'EB Garamond Variable',
    category: 'serif',
    isVariable: true,
    weights: [400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'libre-baskerville',
    packageName: '@fontsource/libre-baskerville',
    family: 'Libre Baskerville',
    category: 'serif',
    isVariable: false,
    weights: [400, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'lora',
    packageName: '@fontsource-variable/lora',
    family: 'Lora Variable',
    category: 'serif',
    isVariable: true,
    weights: [400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  {
    id: 'merriweather',
    packageName: '@fontsource-variable/merriweather',
    family: 'Merriweather Variable',
    category: 'serif',
    isVariable: true,
    weights: [300, 400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
  {
    id: 'playfair-display',
    packageName: '@fontsource-variable/playfair-display',
    family: 'Playfair Display Variable',
    category: 'serif',
    isVariable: true,
    weights: [400, 500, 600, 700, 800],
    license: 'OFL-1.1',
  },
]

function categoryOf(value: string): FontCategory {
  const category = FONT_CATEGORIES.find((candidate) => candidate === value)
  if (category === undefined) throw new Error(`Unknown font category: ${value}`)
  return category
}

export const FONT_CATALOGUE: readonly FontFamily[] = [
  ...BASE_FONTS.map((font) => ({ ...font, licensePath: `/fonts/licenses/${font.id}.txt` })),
  ...extendedFonts.map((font) => ({ ...font, category: categoryOf(font.category) })),
]

export const DEFAULT_FONT_FAMILY = 'Inter Variable'

export function findFont(family: string): FontFamily | undefined {
  return FONT_CATALOGUE.find((candidate) => candidate.family === family)
}

/** Nearest weight the family actually ships. */
export function nearestWeight(font: FontFamily, weight: number): number {
  let best = font.weights[0] ?? weight
  for (const candidate of font.weights) {
    if (Math.abs(candidate - weight) < Math.abs(best - weight)) {
      best = candidate
    }
  }
  return best
}
