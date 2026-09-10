import { escapeToBuffer, type StringBuffer } from 'hono/utils/html'

import { APP_NAME } from '../../shared/constants'
import type { EmailMessage } from '../email/sender'

/**
 * HTML-escapes with Hono's escaper; every interpolation below goes through it.
 * The buffer type admits promises for streaming; `escapeToBuffer` only ever
 * appends to the leading string, which is all we read back.
 */
function escapeHtml(value: string): string {
  const buffer: StringBuffer = ['']
  escapeToBuffer(value, buffer)
  const [escaped] = buffer
  return typeof escaped === 'string' ? escaped : ''
}

function layout(title: string, body: string, actionUrl: string, actionLabel: string): string {
  const safeUrl = escapeHtml(actionUrl)
  return `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;padding:24px">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
<p><a href="${safeUrl}" style="display:inline-block;background:#a94965;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">${escapeHtml(actionLabel)}</a></p>
<p style="color:#6b7280;font-size:13px">If the button does not work, copy this link:<br>${safeUrl}</p>
<p style="color:#6b7280;font-size:13px">${escapeHtml(APP_NAME)}</p>
</body></html>`
}

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: `Verify your email for ${APP_NAME}`,
    text: `Confirm your email address to finish creating your ${APP_NAME} account:\n\n${url}\n\nIf you did not sign up, ignore this message.`,
    html: layout(
      'Verify your email',
      `Confirm your email address to finish creating your ${APP_NAME} account. If you did not sign up, ignore this message.`,
      url,
      'Verify email',
    ),
  }
}

export function resetPasswordEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: `Someone requested a password reset for your ${APP_NAME} account. Use this link within one hour:\n\n${url}\n\nIf this was not you, ignore this message; your password is unchanged.`,
    html: layout(
      'Reset your password',
      'Use the button below within one hour. If this was not you, ignore this message; your password is unchanged.',
      url,
      'Reset password',
    ),
  }
}

export function invitationEmail(
  to: string,
  organizationName: string,
  inviterName: string,
  url: string,
): EmailMessage {
  return {
    to,
    subject: `${inviterName} invited you to ${organizationName} on ${APP_NAME}`,
    text: `${inviterName} invited you to join ${organizationName} on ${APP_NAME}. Accept the invitation here:\n\n${url}`,
    html: layout(
      `Join ${organizationName}`,
      `${inviterName} invited you to join ${organizationName} on ${APP_NAME}.`,
      url,
      'Accept invitation',
    ),
  }
}

/** Account admission email: it explicitly promises no membership or content access. */
export function siteInvitationEmail(to: string, inviterName: string, url: string): EmailMessage {
  const body = `${inviterName} invited you to ${APP_NAME}. Create your own private account and workspace. This invitation does not give either of you access to the other's photos or presets. The invitation expires in seven days.`
  return {
    to,
    subject: `${inviterName} invited you to ${APP_NAME}`,
    text: `${body}\n\n${url}`,
    html: layout(`You're invited to ${APP_NAME}`, body, url, 'Create your account'),
  }
}
