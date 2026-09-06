import type { EmailMessage, EmailSender } from './sender'
import { DEV_MAILBOX_CAPACITY } from '../../shared/constants'

/**
 * Development and test provider. Logs each message and keeps the most recent
 * ones in a bounded in-memory mailbox so end-to-end tests can follow
 * verification and invitation links. Refused in production by env validation.
 *
 * The mailbox lives as long as the service container, which is cached per
 * `env` object: stable under `wrangler`/`vite preview`, but `vite dev`
 * supplies a fresh `env` per request, so there the log line is the record.
 */
export interface DevMailbox extends EmailSender {
  /** Newest first. */
  messages(): readonly EmailMessage[]
}

export function createConsoleEmailSender(): DevMailbox {
  const buffer: EmailMessage[] = []
  return {
    send(message: EmailMessage) {
      console.info('[email:console]', message.to, message.subject, message.text)
      buffer.unshift(message)
      if (buffer.length > DEV_MAILBOX_CAPACITY) {
        buffer.length = DEV_MAILBOX_CAPACITY
      }
      return Promise.resolve()
    },
    messages() {
      return buffer
    },
  }
}
