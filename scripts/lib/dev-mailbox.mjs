import { setTimeout as sleep } from 'node:timers/promises'

const MAX_ATTEMPTS = 20
const POLL_INTERVAL_MS = 250

/**
 * Polls the development mailbox (console email provider) until a message to
 * `email` containing a link with `fragment` arrives, and returns that link.
 *
 * @param {() => Promise<{ messages: { to: string, text: string }[] }>} fetchMailbox
 * @param {string} email
 * @param {string} fragment
 * @returns {Promise<string>}
 */
export async function waitForLink(fetchMailbox, email, fragment) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const mailbox = await fetchMailbox()
    const message = mailbox.messages.find(
      (candidate) => candidate.to === email && candidate.text.includes(fragment),
    )
    const link = message?.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(fragment))
    if (link !== undefined) {
      return link
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('The expected fixture email link did not arrive; is EMAIL_PROVIDER=console?')
}
