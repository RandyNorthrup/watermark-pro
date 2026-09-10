/** Real gate invocation against independent build-shaped fixtures; budgets remain unchanged. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const repository = path.resolve(import.meta.dirname, '..')
const PAYLOAD_BYTES = 180 * 1024
const oversized = () => `/* ${randomBytes(PAYLOAD_BYTES).toString('base64')} */`
function gate(directory) {
  return spawnSync(process.execPath, ['scripts/bundle-budget.mjs'], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, LUMAFOIL_CLIENT_DIR: directory },
  })
}

test('real budget gate rejects oversized public, app, and shared route imports, then passes after restoration', async () => {
  const parent = await realpath(os.tmpdir())
  const directory = await mkdtemp(path.join(parent, 'lumafoil-budget-test-'))
  try {
    await mkdir(path.join(directory, '.vite'))
    await mkdir(path.join(directory, 'landing'))
    const manifest = {
      entry: { isEntry: true, file: 'entry.js' },
      route: {
        isDynamicEntry: true,
        src: 'src/client/routes/app/editor.tsx',
        file: 'route.js',
        imports: ['entry', 'shared'],
      },
      shared: { file: 'shared.js', name: 'editor-shared' },
    }
    await writeFile(path.join(directory, '.vite', 'manifest.json'), JSON.stringify(manifest))
    const document = '<script type="module" src="/entry.js"></script>'
    await writeFile(path.join(directory, 'index.html'), document)
    await writeFile(
      path.join(directory, 'landing', 'en.html'),
      '<script src="/public.js"></script>',
    )
    for (const filename of ['entry.js', 'route.js', 'shared.js', 'public.js'])
      await writeFile(path.join(directory, filename), 'export {};')
    const green = gate(directory)
    assert.equal(green.status, 0, green.stderr)
    for (const [filename, diagnostic] of [
      ['public.js', 'public landing JS'],
      ['entry.js', 'initial JS for /app/* shell'],
      ['shared.js', 'route chunk editor-shared'],
    ]) {
      await writeFile(path.join(directory, filename), oversized())
      const red = gate(directory)
      assert.equal(red.status, 1)
      assert.ok(red.stderr.includes(diagnostic), red.stderr)
      await writeFile(path.join(directory, filename), 'export {};')
    }
    const restored = gate(directory)
    assert.equal(restored.status, 0, restored.stderr)
    await writeFile(
      path.join(directory, 'index.html'),
      document + '<script>' + oversized() + '</script>',
    )
    const inline = gate(directory)
    assert.equal(inline.status, 1)
    assert.match(inline.stderr, /initial JS for \/app\/\* shell/)
    await writeFile(path.join(directory, 'index.html'), document)
    const restoredInline = gate(directory)
    assert.equal(restoredInline.status, 0, restoredInline.stderr)
    delete manifest.shared
    await writeFile(path.join(directory, '.vite', 'manifest.json'), JSON.stringify(manifest))
    const missing = gate(directory)
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /missing chunk shared/)
  } finally {
    const actual = await realpath(directory)
    assert.equal(path.dirname(actual), parent)
    assert.ok(path.basename(actual).startsWith('lumafoil-budget-test-'))
    await rm(actual, { recursive: true, force: true })
  }
})
