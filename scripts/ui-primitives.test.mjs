import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const CLIENT_ROOT = path.join('src', 'client')
const SWITCH_PRIMITIVE = 'components/ui/switch.tsx'
const SLIDER_PRIMITIVE = 'components/ui/slider-field.tsx'
const SELECTION_CHECKBOX_FILES = new Set([
  'components/gallery/gallery.tsx',
  'components/import/onedrive-dialog.tsx',
  'components/presets/import-dialog.tsx',
  'components/presets/preset-checklist.tsx',
  'components/video/video-tool.tsx',
])

function clientSources() {
  return readdirSync(CLIENT_ROOT, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({
      file: file.replaceAll('\\', '/'),
      source: readFileSync(path.join(CLIENT_ROOT, file), 'utf8'),
    }))
}

test('boolean settings and sliders use the shared themed primitives', () => {
  const findings = []
  for (const { file, source } of clientSources()) {
    if (
      file !== SWITCH_PRIMITIVE &&
      (/role=["']switch["']/.test(source) || /Switch\.(Root|Thumb)/.test(source))
    )
      findings.push(`${file}: ad-hoc switch`)
    if (file !== SLIDER_PRIMITIVE && /type=["']range["']/.test(source))
      findings.push(`${file}: ad-hoc range slider`)
    if (/type=["']checkbox["']/.test(source) && !SELECTION_CHECKBOX_FILES.has(file))
      findings.push(`${file}: checkbox is not an approved multi-select control`)
  }
  assert.deepEqual(findings, [])
})
