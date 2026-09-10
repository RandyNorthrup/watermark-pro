/** Per-run loopback TLS certificates; no operating-system trust store is modified. */
import { spawnSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

const PROCESS_TIMEOUT_MS = 15_000
const CERTIFICATE_LIFETIME_DAYS = '1'
const CERTIFICATE_PREFIX = 'certificate-'
const EXECUTION_OPTIONS = { encoding: 'utf8', windowsHide: true, timeout: PROCESS_TIMEOUT_MS }

function opensslCommand() {
  const candidates = ['openssl']
  if (process.platform === 'win32')
    candidates.push(
      path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/usr/bin/openssl.exe'),
    )
  for (const command of candidates) {
    const result = spawnSync(command, ['version'], EXECUTION_OPTIONS)
    if (result.status === 0 && /^OpenSSL 3\./.test(result.stdout)) return command
  }
  throw new Error('HTTP/2 audits require OpenSSL 3 on PATH or bundled with Git for Windows.')
}

async function certificateDirectory() {
  const workspace = await realpath(process.cwd())
  const temporary = path.join(workspace, 'temp')
  await mkdir(temporary, { recursive: true })
  const actualTemporary = await realpath(temporary)
  if (!actualTemporary.startsWith(workspace + path.sep))
    throw new Error('Audit certificate storage escapes the workspace.')
  const parent = path.join(actualTemporary, 'lumafoil-audit-tls')
  await mkdir(parent, { recursive: true })
  const actualParent = await realpath(parent)
  if (!actualParent.startsWith(workspace + path.sep))
    throw new Error('Audit certificate parent escapes the workspace.')
  return {
    parent: actualParent,
    directory: await mkdtemp(path.join(actualParent, CERTIFICATE_PREFIX)),
  }
}

async function removeCertificateDirectory(location) {
  const actual = await realpath(location.directory)
  if (
    path.dirname(actual) !== location.parent ||
    !path.basename(actual).startsWith(CERTIFICATE_PREFIX)
  )
    throw new Error('Refusing to remove unverified audit certificate storage.')
  await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

/** Generate one short-lived key and return a browser exception restricted to that public key. */
export async function createAuditCertificate() {
  const command = opensslCommand()
  const location = await certificateDirectory()
  try {
    const keyPath = path.join(location.directory, 'key.pem')
    const certificatePath = path.join(location.directory, 'certificate.pem')
    const result = spawnSync(
      command,
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-sha256',
        '-noenc',
        '-batch',
        '-days',
        CERTIFICATE_LIFETIME_DAYS,
        '-keyout',
        keyPath,
        '-out',
        certificatePath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      EXECUTION_OPTIONS,
    )
    if (result.status !== 0)
      throw new Error('OpenSSL could not generate the ephemeral loopback audit certificate.')
    const key = await readFile(keyPath)
    const cert = await readFile(certificatePath)
    const certificate = new X509Certificate(cert)
    if (
      certificate.checkHost('localhost') === undefined ||
      certificate.checkIP('127.0.0.1') === undefined
    )
      throw new Error('Audit certificate does not cover the loopback endpoints.')
    const publicKey = certificate.publicKey.export({ type: 'spki', format: 'der' })
    const pin = createHash('sha256').update(publicKey).digest('base64')
    return {
      key,
      cert,
      directory: location.directory,
      browserFlag: '--ignore-certificate-errors-spki-list=' + pin,
      dispose: () => removeCertificateDirectory(location),
    }
  } catch (error) {
    await removeCertificateDirectory(location)
    throw error
  }
}
