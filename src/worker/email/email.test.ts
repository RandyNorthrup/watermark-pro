import { describe, expect, it, vi } from 'vitest'

import { createCloudflareEmailSender } from './cloudflare'
import { createConsoleEmailSender } from './console'
import { EmailDeliveryError } from './sender'
import { DEV_MAILBOX_CAPACITY } from '../../shared/constants'

const message = { to: 'a@example.test', subject: 'Hello', text: 'plain', html: '<p>plain</p>' }

describe('createCloudflareEmailSender', () => {
  it('passes the message to the binding with the configured sender', async () => {
    const binding = { send: vi.fn(() => Promise.resolve({ messageId: 'm1' })) }
    await createCloudflareEmailSender(binding, 'no-reply@watermark.blowmoney.net').send(message)
    expect(binding.send).toHaveBeenCalledWith({
      from: 'no-reply@watermark.blowmoney.net',
      ...message,
    })
  })

  it('wraps binding failures without dropping the cause', async () => {
    const binding = { send: vi.fn(() => Promise.reject(new Error('quota exceeded'))) }
    const sender = createCloudflareEmailSender(binding, 'no-reply@watermark.blowmoney.net')
    await expect(sender.send(message)).rejects.toBeInstanceOf(EmailDeliveryError)
    await expect(sender.send(message)).rejects.toMatchObject({
      message: expect.stringContaining('quota exceeded'),
      cause: expect.objectContaining({ message: 'quota exceeded' }),
    })
  })
})

describe('createConsoleEmailSender', () => {
  it('keeps only the most recent messages, newest first', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {
      // Silence the log lines in test output.
    })
    const mailbox = createConsoleEmailSender()
    for (let index = 0; index < DEV_MAILBOX_CAPACITY + 2; index += 1) {
      await mailbox.send({ ...message, subject: `#${String(index)}` })
    }
    const subjects = mailbox.messages().map((captured) => captured.subject)
    expect(subjects).toHaveLength(DEV_MAILBOX_CAPACITY)
    expect(subjects[0]).toBe(`#${String(DEV_MAILBOX_CAPACITY + 1)}`)
    expect(subjects).not.toContain('#0')
    info.mockRestore()
  })
})
