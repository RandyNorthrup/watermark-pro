/* eslint-disable unicorn/prefer-https -- these tests deliberately use http:// URLs to prove the policy refuses them */
import { describe, expect, it } from 'vitest'

import { assertImportableUrl, UnsupportableUrlError } from './url-policy'

describe('assertImportableUrl', () => {
  it('accepts public https domains', () => {
    expect(assertImportableUrl('https://example.com/photo.jpg').hostname).toBe('example.com')
    expect(assertImportableUrl('https://cdn.images.co.uk/a.png').hostname).toBe('cdn.images.co.uk')
    expect(assertImportableUrl('https://sub.example.com:8443/a.png').hostname).toBe(
      'sub.example.com',
    )
  })

  it.each([
    ['not a url at all', 'nonsense'],
    ['a non-https scheme', 'http://example.com/a.jpg'],
    ['an ftp scheme', 'ftp://example.com/a.jpg'],
    ['embedded credentials', 'https://user:pass@example.com/a.jpg'],
    ['localhost', 'https://localhost/a.jpg'],
    ['a .local host', 'https://printer.local/a.jpg'],
    ['a .internal host', 'https://metadata.google.internal/a.jpg'],
    ['an .arpa host', 'https://1.0.0.127.in-addr.arpa/a.jpg'],
    ['an IPv4 literal', 'https://127.0.0.1/a.jpg'],
    ['a private IPv4 literal', 'https://192.168.1.1/a.jpg'],
    ['an IPv6 literal', 'https://[::1]/a.jpg'],
    ['the decimal form of an IP', 'https://2130706433/a.jpg'],
    ['the hex form of an IP', 'https://0x7f000001/a.jpg'],
    ['a single-label host', 'https://intranet/a.jpg'],
  ])('rejects %s', (_label, raw) => {
    expect(() => assertImportableUrl(raw)).toThrow(UnsupportableUrlError)
  })
})
