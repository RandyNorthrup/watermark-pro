/**
 * Transactional email abstraction. Better Auth calls `send` for verification,
 * password reset, and invitation messages; the implementation is chosen from
 * `EMAIL_PROVIDER` at request time.
 */
export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>
}

export class EmailDeliveryError extends Error {
  override readonly name = 'EmailDeliveryError'
}
