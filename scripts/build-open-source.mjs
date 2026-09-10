/** Package the corresponding source for the MPL library actually shipped in the video tools. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { zipSync } from 'fflate'

const PACKAGE = 'mediabunny'
const root = path.join('node_modules', PACKAGE)
const project = JSON.parse(await readFile('package.json', 'utf8'))
const installed = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (
  installed.version !== project.dependencies[PACKAGE] ||
  !/^\d+\.\d+\.\d+$/.test(installed.version)
)
  throw new Error('The distributed media source must match the exact installed dependency pin.')
const filename = `${PACKAGE}-${installed.version}-source.zip`
const offer = await readFile('public/open-source.md', 'utf8')
if (!offer.includes(filename))
  throw new Error('Update the source offer when changing the media dependency version.')

const entries = {}
for (const filename of ['LICENSE', 'README.md', 'package.json']) {
  entries[filename] = await readFile(path.join(root, filename))
}
const source = path.join(root, 'src')
const sourceEntries = await readdir(source, { recursive: true, withFileTypes: true })
for (const entry of sourceEntries) {
  if (entry.isSymbolicLink()) throw new Error('Source archives may not follow symbolic links.')
  if (entry.isFile()) {
    const absolute = path.join(entry.parentPath, entry.name)
    const relative = path.relative(root, absolute).replaceAll('\\', '/')
    entries[relative] = await readFile(absolute)
  }
}
const output = path.join('public', 'open-source')
await mkdir(output, { recursive: true })
// ZIP uses local calendar fields; a fixed calendar date makes this archive reproducible.
await writeFile(
  path.join(output, filename),
  zipSync(entries, { level: 9, mtime: new Date(2000, 0, 1) }),
)
console.info(
  `Packaged ${PACKAGE} ${installed.version}: ${Object.keys(entries).length} source/license files.`,
)
