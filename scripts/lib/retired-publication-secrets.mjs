/** Revoked credentials retain only digests and immutable finding identities, never their values. */
import { createHash } from 'node:crypto'

const RETIRED_CREDENTIALS = Object.freeze([
  Object.freeze({
    sha256: 'ba215b6bd57b37aa85604f57612a8e8a12c287537767c158e15f5dd492423ecc',
    commit: '730aee4f9e5f96dcadeee227db5bb95d24addf46',
    file: 'wrangler.jsonc',
    rule: 'gcp-api-key',
    line: 120,
  }),
])
const GOOGLE_KEY = /(?<![\w-])AIza[\w-]{35}(?![\w-])/g

/** Produce a same-length scanner copy only for bytes originating in reachable historical blobs. */
export function maskRetiredHistoricalSecrets(bytes, origin, retired = RETIRED_CREDENTIALS) {
  if (origin !== 'history-blob') return { bytes, occurrences: 0 }
  let occurrences = 0
  // Latin-1 maps each byte to one code point, preserving binary bytes and offsets.
  const masked = bytes.toString('latin1').replaceAll(GOOGLE_KEY, (value) => {
    const digest = createHash('sha256').update(value).digest('hex')
    if (retired.every((credential) => credential.sha256 !== digest)) return value
    occurrences += 1
    return '*'.repeat(value.length)
  })
  return { bytes: occurrences === 0 ? bytes : Buffer.from(masked, 'latin1'), occurrences }
}

/** The Git scanner exception is one exact immutable finding, never a file, rule, or ignore-file entry. */
export function isRetiredHistoryFinding(finding, origin, retired = RETIRED_CREDENTIALS) {
  if (origin !== 'history') return false
  return retired.some(
    (credential) =>
      finding.Fingerprint ===
        `${credential.commit}:${credential.file}:${credential.rule}:${credential.line}` &&
      finding.Commit === credential.commit &&
      finding.File === credential.file &&
      finding.RuleID === credential.rule &&
      finding.StartLine === credential.line,
  )
}
