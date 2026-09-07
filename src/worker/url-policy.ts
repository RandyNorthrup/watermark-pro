/**
 * Import-from-a-URL SSRF policy (M16). The Worker fetches on the user's behalf,
 * so an attacker could otherwise point it at internal services. This narrows
 * the allowed targets to public https domains: no other scheme, no embedded
 * credentials, no IP literals (v4/v6, or the decimal/hex forms that resolve to
 * one), no single-label or internal hostnames. Cloudflare Workers cannot reach
 * RFC-1918 addresses today, so DNS-rebinding to a private IP is not a live path;
 * the literal/internal-name checks are defence in depth. Pure and table-tested.
 */

/** Thrown for any link the policy refuses; the route maps it to 400 unsupported_url. */
export class UnsupportableUrlError extends Error {
  override readonly name = 'UnsupportableUrlError'
}

const DENIED_HOSTS = new Set(['localhost'])
const DENIED_HOST_SUFFIXES = ['.local', '.internal', '.arpa', '.localhost'] as const
/** A dotted-quad IPv4 literal, e.g. 127.0.0.1. */
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/
/** An all-numeric or 0x-hex host with no dots — the decimal/hex forms of an IP. */
const NUMERIC_HOST = /^(?:0x)?[0-9a-f]+$/

/**
 * Validates `raw` and returns the parsed URL, or throws `UnsupportableUrlError`.
 * Accepts only public https domains.
 */
export function assertImportableUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsupportableUrlError('Enter a valid URL.')
  }
  if (url.protocol !== 'https:') {
    throw new UnsupportableUrlError('Only https links can be imported.')
  }
  if (url.username !== '' || url.password !== '') {
    throw new UnsupportableUrlError('A link that carries credentials cannot be imported.')
  }
  const host = url.hostname.toLowerCase()
  if (DENIED_HOSTS.has(host) || DENIED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UnsupportableUrlError('That host is not allowed.')
  }
  const isIpLiteral =
    host.includes(':') || host.startsWith('[') || IPV4_LITERAL.test(host) || NUMERIC_HOST.test(host)
  if (isIpLiteral || !host.includes('.')) {
    throw new UnsupportableUrlError('Import from a domain name, not an IP address.')
  }
  return url
}
