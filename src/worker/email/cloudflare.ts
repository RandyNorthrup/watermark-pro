import { EmailDeliveryError, type EmailMessage, type EmailSender } from './sender'

/**
 * Sends through the Cloudflare Email Sending binding (`send_email` in
 * wrangler.jsonc). The sender address must belong to a zone in the account.
 */
export function createCloudflareEmailSender(binding: SendEmail, from: string): EmailSender {
  return {
    async send(message: EmailMessage) {
      try {
        await binding.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        })
      } catch (error) {
        throw new EmailDeliveryError(`Email to ${message.to} was rejected by Cloudflare`, {
          cause: error,
        })
      }
    },
  }
}
