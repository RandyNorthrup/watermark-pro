/** Synthetic identity shared only by isolated local verification tools. Never use in a deployed database. */
import { z } from 'zod'

export const TEST_SITE_OWNER = {
  name: 'Verification Owner',
  email: 'verification-owner@example.test',
  password: 'disposable local verification passphrase',
} as const

const messageSchema = z.object({ to: z.string(), text: z.string() })
const mailboxSchema = z.object({ messages: z.array(messageSchema) })
const workspaceSchema = z.object({ organizationId: z.string().min(1) })
const ownerSessionSchema = z.object({
  session: z.object({ userId: z.string().min(1) }),
  user: z.object({
    id: z.string().min(1),
    email: z.literal(TEST_SITE_OWNER.email),
    emailVerified: z.literal(true),
    role: z.literal('owner'),
  }),
})
const POLICY = {
  attempts: 20,
  intervalMs: 250,
  unauthorized: 401,
  forbidden: 403,
  duplicate: 422,
  redirect: 302,
} as const

function mergeCookies(current: string, response: Response): string {
  const entries = current === '' ? [] : current.split('; ')
  const cookies = new Map(
    entries.map((part) => {
      const split = part.indexOf('=')
      return [part.slice(0, split), part.slice(split + 1)]
    }),
  )
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]
    if (pair === undefined) continue
    const split = pair.indexOf('=')
    if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1))
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

/** Bootstrap once, sign in separately for each caller, and fail closed on a database owned by anyone else. */
export async function ensureTestSiteOwner(
  origin: string,
): Promise<{ cookie: string; organizationId: string }> {
  const base = new URL(origin)
  if (
    base.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
    base.pathname !== '/' ||
    base.search !== '' ||
    base.hash !== '' ||
    base.username !== '' ||
    base.password !== ''
  ) {
    throw new Error('The synthetic owner is restricted to a loopback HTTP gate origin')
  }
  const request = async (path: string, body?: unknown, cookie = '') =>
    await fetch(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      headers: {
        origin: base.origin,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(cookie !== '' && { cookie }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const mailbox = await request('/api/dev/mailbox')
  if (!mailbox.ok) throw new Error('A console-mailbox gate server is required')
  mailboxSchema.parse(await mailbox.json())
  let signedIn = await request('/api/auth/sign-in/email', TEST_SITE_OWNER)
  if (!signedIn.ok) {
    if (signedIn.status !== POLICY.unauthorized && signedIn.status !== POLICY.forbidden)
      throw new Error(`Gate sign-in failed: ${String(signedIn.status)}`)
    const signup = await request('/api/auth/sign-up/email', {
      ...TEST_SITE_OWNER,
      callbackURL: '/app',
    })
    if (!signup.ok && signup.status !== POLICY.duplicate)
      throw new Error(`Gate owner signup failed: ${String(signup.status)}`)
    const resend = await request('/api/auth/send-verification-email', {
      email: TEST_SITE_OWNER.email,
      callbackURL: '/app',
    })
    if (!resend.ok) throw new Error(`Gate verification request failed: ${String(resend.status)}`)
    let isVerified = false
    for (let attempt = 0; attempt < POLICY.attempts; attempt++) {
      const response = await request('/api/dev/mailbox')
      const messages = mailboxSchema.parse(await response.json()).messages
      const message = messages.find(
        (candidate) =>
          candidate.to === TEST_SITE_OWNER.email &&
          candidate.text.includes('/api/auth/verify-email'),
      )
      const link = message?.text
        .match(/https?:\/\/\S+/g)
        ?.find((url) => url.includes('/api/auth/verify-email'))
      if (link !== undefined) {
        const url = new URL(link)
        if (url.origin !== base.origin || url.pathname !== '/api/auth/verify-email')
          throw new Error('Gate verification link has an unexpected origin')
        const verification = await request(`${url.pathname}${url.search}`)
        if (!verification.ok && verification.status !== POLICY.redirect)
          throw new Error(`Gate verification failed: ${String(verification.status)}`)
        isVerified = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, POLICY.intervalMs))
    }
    if (!isVerified) throw new Error('Gate owner verification email did not arrive')
    signedIn = await request('/api/auth/sign-in/email', TEST_SITE_OWNER)
  }
  if (!signedIn.ok) throw new Error(`Verified gate sign-in failed: ${String(signedIn.status)}`)
  let cookie = mergeCookies('', signedIn)
  if (cookie === '') throw new Error('Gate sign-in returned no session cookie')
  const promotion = await request('/api/dev/promote-site-owner', { email: TEST_SITE_OWNER.email })
  if (!promotion.ok)
    throw new Error('Gate database has another site owner; use isolated gate state')
  const ownerResponse = await request(
    '/api/auth/get-session?disableCookieCache=true',
    undefined,
    cookie,
  )
  const ownerSession = ownerResponse.ok
    ? ownerSessionSchema.safeParse(await ownerResponse.json())
    : null
  if (
    ownerSession === null ||
    !ownerSession.success ||
    ownerSession.data.session.userId !== ownerSession.data.user.id
  )
    throw new Error('Gate session is not the verified synthetic site owner')
  cookie = mergeCookies(cookie, ownerResponse)
  const workspace = await request('/api/me/workspace', {}, cookie)
  if (!workspace.ok) throw new Error(`Gate workspace setup failed: ${String(workspace.status)}`)
  cookie = mergeCookies(cookie, workspace)
  return { cookie, organizationId: workspaceSchema.parse(await workspace.json()).organizationId }
}
