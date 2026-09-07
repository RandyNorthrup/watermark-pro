import { describe, expect, it } from 'vitest'

import { invitationEmail, resetPasswordEmail, verificationEmail } from './templates'

describe('email templates', () => {
  it('include the action link in both text and html bodies', () => {
    const url = 'http://localhost:5273/api/auth/verify-email?token=abc&callbackURL=%2F'
    const message = verificationEmail('a@example.test', url)
    expect(message.to).toBe('a@example.test')
    expect(message.text).toContain(url)
    expect(message.html).toContain(
      'href="http://localhost:5273/api/auth/verify-email?token=abc&amp;callbackURL=%2F"',
    )
  })

  it('escape user-controlled values in html', () => {
    const message = invitationEmail(
      'b@example.test',
      '<script>alert(1)</script>',
      'Eve "Hacker" <eve>',
      'http://localhost:5273/accept-invitation/x',
    )
    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;')
    expect(message.html).toContain('Eve &quot;Hacker&quot; &lt;eve&gt;')
    expect(message.subject).toContain('Eve "Hacker" <eve>')
    expect(message.html).not.toContain('<strong>')
  })

  it('tell users an unrequested reset can be ignored', () => {
    const message = resetPasswordEmail('c@example.test', 'http://localhost:5273/reset?token=t')
    expect(message.text).toMatch(/ignore this message/)
    expect(message.subject).toMatch(/Reset your/)
  })
})
