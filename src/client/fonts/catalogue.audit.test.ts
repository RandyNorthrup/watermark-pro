/**
 * Audits the bundled Fontsource packages on disk: licence files present,
 * metadata agrees with the catalogue, and every promised woff2 exists within
 * budget. Needs Node's filesystem, so it is type-checked under tsconfig.node.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FONT_CATALOGUE } from './catalogue'

const require = createRequire(import.meta.url)

/** PLAN.md §5.5: any single font file ≤ 120 kB. */
const FONT_FILE_BUDGET_BYTES = 120 * 1024

/** Fontsource file naming: `<id>-latin-<weight|wght>-normal.woff2`. */
function expectedFiles(font: (typeof FONT_CATALOGUE)[number]): string[] {
  return font.isVariable
    ? [`${font.id}-latin-wght-normal.woff2`]
    : font.weights.map((weight) => `${font.id}-latin-${String(weight)}-normal.woff2`)
}

describe('bundled font packages', () => {
  it.each(FONT_CATALOGUE.map((font) => [font.family, font] as const))(
    '%s ships an open licence, the files it promises, and stays within budget',
    (_family, font) => {
      const directory = path.dirname(require.resolve(`${font.packageName}/package.json`))
      expect(existsSync(path.join(directory, 'LICENSE'))).toBe(true)
      const metadata = JSON.parse(readFileSync(path.join(directory, 'metadata.json'), 'utf8')) as {
        license: { type: string }
        family: string
      }
      expect(['OFL-1.1', 'Apache-2.0']).toContain(metadata.license.type)
      expect(metadata.license.type).toBe(font.license)
      expect(font.family.startsWith(metadata.family)).toBe(true)
      for (const file of expectedFiles(font)) {
        expect(statSync(path.join(directory, 'files', file)).size).toBeLessThanOrEqual(
          FONT_FILE_BUDGET_BYTES,
        )
      }
    },
  )
})
