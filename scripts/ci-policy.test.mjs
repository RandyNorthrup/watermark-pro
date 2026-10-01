import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

/** Exercise the actual workflow shell, so changing it changes the tested gate. */
async function stepScripts(filename, name) {
  const source = await readFile(new URL(`../.github/${filename}`, import.meta.url), 'utf8')
  const sections = source.split(`- name: ${name}\n`).slice(1)
  assert.ok(sections.length > 0, `Missing workflow step: ${name}`)
  return sections.map((section) => {
    const block = /( +)run: \|\n((?: +[^\n]*\n)+)/.exec(section)
    assert.ok(block, `Missing shell for ${name}`)
    const indentation = block[1].length + 2
    return block[2]
      .split('\n')
      .map((line) => line.slice(indentation))
      .join('\n')
  })
}

function shell(script, env) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

test('the required aggregate rejects each failed, skipped, cancelled or absent prerequisite/device', async () => {
  const [script] = await stepScripts(
    'workflows/ci.yml',
    'Require every device and prerequisite to succeed',
  )
  const green = Object.fromEntries(
    [
      'QUALITY_RESULT',
      'SAST_RESULT',
      'MATRIX_RESULT',
      'DESKTOP_RESULT',
      'IPHONE_RESULT',
      'IPAD_RESULT',
      'ANDROID_RESULT',
    ].map((key) => [key, 'success']),
  )
  assert.equal(shell(script, green).status, 0)
  for (const key of Object.keys(green)) {
    for (const result of ['failure', 'skipped', 'cancelled', '', 'neutral']) {
      const output = shell(script, { ...green, [key]: result })
      assert.equal(output.status, 1, `${key}=${result} must block merges`)
      assert.match(output.stdout, new RegExp(key))
    }
  }
})

test('both production guards reject non-main refs, stale commits and failed API reads', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8',
  )
  assert.equal(workflow.split('uses: ./.github/actions/verify-production-source').length - 1, 2)
  const scripts = await stepScripts(
    'actions/verify-production-source/action.yml',
    'Require the current main commit',
  )
  assert.equal(scripts.length, 1)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lumafoil-ci-policy-'))
  try {
    const executable = path.join(directory, 'gh')
    await writeFile(
      executable,
      '#!/bin/sh\nif [ "$FAKE_GH_FAIL" = true ]; then exit 1; fi\nprintf "%s\\n" "$FAKE_GH_SHA"\n',
    )
    await chmod(executable, 0o755)
    const green = {
      PATH: `${directory}:${process.env.PATH}`,
      SOURCE_REF: 'refs/heads/main',
      SOURCE_SHA: 'verified',
      SOURCE_REPOSITORY: 'fixture/repository',
      FAKE_GH_SHA: 'verified',
      FAKE_GH_FAIL: 'false',
    }
    for (const script of scripts) {
      assert.equal(shell(script, green).status, 0)
      for (const SOURCE_REF of ['refs/heads/feature', 'refs/tags/main', 'refs/pull/1/merge'])
        assert.equal(shell(script, { ...green, SOURCE_REF }).status, 1)
      assert.equal(shell(script, { ...green, FAKE_GH_SHA: 'newer' }).status, 1)
      assert.equal(shell(script, { ...green, FAKE_GH_FAIL: 'true' }).status, 1)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
