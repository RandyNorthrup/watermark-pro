import { describe, expect, it } from 'vitest'

import { clientErrorReportSchema } from './api'
import { classifyClientError, redactRoutePath, sanitizeErrorSource } from './observability'

describe('private route context', () => {
  it('keeps ordinary paths but redacts bearer links and URL parameters', () => {
    expect(redactRoutePath('/app/editor')).toBe('/app/editor')
    expect(redactRoutePath('/share/private-canary?password=private')).toBe('/share/:token')
    expect(redactRoutePath('/api/share/private-canary/photos/photo-1/file')).toBe(
      '/api/share/:token/photos/:id/file',
    )
    expect(redactRoutePath('/accept-invitation/private-canary#secret')).toBe(
      '/accept-invitation/:token',
    )
    expect(redactRoutePath('/app/library/private-id')).toBe('/app/library/:id')
    expect(redactRoutePath('/app/library/new')).toBe('/app/library/new')
    expect(redactRoutePath('/app/')).toBe('/app')
    expect(redactRoutePath('/private-person-name/secret')).toBe('/unknown')
  })

  it('keeps only fixed error classifications and compiled asset coordinates', () => {
    expect(classifyClientError('SyntaxError')).toBe('SyntaxError')
    expect(classifyClientError('private@example.test')).toBe('Error')
    expect(sanitizeErrorSource('/assets/editor-abc123.js:12:3')).toBe(
      '/assets/editor-abc123.js:12:3',
    )
    for (const source of [
      '/share/token:1:2',
      '/assets/editor.js?token=secret:1:2',
      'https://app.test/assets/editor.js:1:2',
      '/assets/../private.js:1:2',
    ])
      expect(sanitizeErrorSource(source)).toBeUndefined()
  })

  it('also sanitizes direct reports at the server boundary and rejects non-path routes', () => {
    expect(
      clientErrorReportSchema.parse({ message: 'failure', route: '/share/private-canary' }).route,
    ).toBe('/share/:token')
    expect(
      clientErrorReportSchema.safeParse({ message: 'failure', route: 'https://outside.test/path' })
        .success,
    ).toBe(false)
  })
})
