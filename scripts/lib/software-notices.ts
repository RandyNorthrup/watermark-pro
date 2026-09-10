/** Fill notices omitted from published package tarballs using reviewed upstream license files. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SUPPLEMENTAL_NOTICES = [
  {
    name: 'qrcode-generator',
    version: '2.0.4',
    digest: '3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c',
  },
  {
    name: 'react-remove-scroll-bar',
    version: '2.3.8',
    digest: 'a79aae0c0f21990d9d963bb3c5a79cdcea9a46f8523ba55c58d7fe776b6ebc84',
  },
] as const

/** Runs before the offline inventory hashes the final browser-served notice bytes. */
export function completeSoftwareNotices(outDir: string): void {
  const filename = path.join(outDir, 'third-party-licenses.md')
  let notices = readFileSync(filename, 'utf8')
  for (const entry of SUPPLEMENTAL_NOTICES) {
    const installed: unknown = JSON.parse(
      readFileSync(path.join('node_modules', entry.name, 'package.json'), 'utf8'),
    )
    if (
      installed === null ||
      typeof installed !== 'object' ||
      !('version' in installed) ||
      installed.version !== entry.version
    )
      throw new Error(`Review the supplemental license after updating ${entry.name}.`)
    const license = readFileSync(
      path.join('public/software-licenses', `${entry.name}-${entry.version}-LICENSE.txt`),
    )
    if (createHash('sha256').update(license).digest('hex') !== entry.digest)
      throw new Error(`The reviewed license notice changed for ${entry.name}.`)
    const header = `## ${entry.name} - ${entry.version} (MIT)\n`
    const start = notices.indexOf(header)
    if (start === -1 || start !== notices.lastIndexOf(header))
      throw new Error(`Expected exactly one bundled license entry for ${entry.name}.`)
    const end = notices.indexOf('\n## ', start + header.length)
    const body = notices.slice(start + header.length, end === -1 ? undefined : end).trim()
    if (body === '')
      notices = notices.replace(header, () => `${header}\n${license.toString('utf8').trim()}\n`)
  }
  writeFileSync(filename, notices)
}
