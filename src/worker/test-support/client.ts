import type { Hono } from 'hono'

import { HTTP_STATUS } from '../../shared/constants'
import type { AppContext } from '../app-context'
import { TEST_APP_URL } from './test-app'
import type { DevMailbox } from '../email/console'

/**
 * Minimal browser stand-in for API tests: keeps a cookie jar and sends the
 * app origin on state-changing requests the way a same-origin fetch would.
 */
export class TestClient {
  readonly #app: Hono<AppContext>
  readonly #env: Env
  readonly #cookies = new Map<string, string>()
  #origin: string

  constructor(app: Hono<AppContext>, env: Env, origin = TEST_APP_URL) {
    this.#app = app
    this.#env = env
    this.#origin = origin
  }

  /** Pretend the next requests come from another site. */
  useOrigin(origin: string): void {
    this.#origin = origin
  }

  get cookieHeader(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.#cookies.size > 0) {
      headers.set('cookie', this.cookieHeader)
    }
    if (init.method !== undefined && init.method !== 'GET') {
      headers.set('origin', this.#origin)
    }
    const response = await this.#app.request(
      `${TEST_APP_URL}${path}`,
      { ...init, headers },
      this.#env,
    )
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';', 1)
      const separator = pair?.indexOf('=') ?? -1
      if (pair !== undefined && separator > 0) {
        const name = pair.slice(0, separator)
        const value = pair.slice(separator + 1)
        if (value === '' || /max-age=0/i.test(cookie)) {
          this.#cookies.delete(name)
        } else {
          this.#cookies.set(name, value)
        }
      }
    }
    return response
  }

  async get(path: string): Promise<Response> {
    return await this.request(path)
  }

  async post(path: string, body: unknown): Promise<Response> {
    return await this.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /**
   * Full sign-up: register, then follow the verification link from the
   * mailbox, which also signs the user in.
   */
  async signUpAndVerify(
    mailbox: DevMailbox,
    user: { name: string; email: string; password: string },
  ): Promise<void> {
    const signUp = await this.post('/api/auth/sign-up/email', user)
    if (!signUp.ok) {
      throw new Error(`sign-up failed: ${String(signUp.status)} ${await signUp.text()}`)
    }
    const link = findLink(mailbox, user.email, '/api/auth/verify-email')
    const verify = await this.get(link)
    if (verify.status >= HTTP_STATUS.badRequest) {
      throw new Error(`verification failed: ${String(verify.status)} ${await verify.text()}`)
    }
  }

  /** Creates an organization through Better Auth and returns its id. */
  async createOrganization(name: string, slug: string): Promise<string> {
    const response = await this.post('/api/auth/organization/create', { name, slug })
    if (!response.ok) {
      throw new Error(`organization create failed: ${String(response.status)}`)
    }
    const body: unknown = await response.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string'
    ) {
      throw new TypeError('organization create returned no id')
    }
    return body.id
  }
}

/** Invites `member` with `role`, signs them up and accepts; returns their client. */
export async function joinAsMember(
  harness: { app: Hono<AppContext>; env: Env; mailbox: DevMailbox },
  owner: TestClient,
  organizationId: string,
  member: { name: string; email: string; password: string },
  role: string,
): Promise<TestClient> {
  const invite = await owner.post('/api/auth/organization/invite-member', {
    email: member.email,
    role,
    organizationId,
  })
  if (!invite.ok) {
    throw new Error(`invite failed: ${String(invite.status)}`)
  }
  const acceptPath = findLink(harness.mailbox, member.email, '/accept-invitation/')
  const client = new TestClient(harness.app, harness.env)
  await client.signUpAndVerify(harness.mailbox, member)
  const accept = await client.post('/api/auth/organization/accept-invitation', {
    invitationId: acceptPath.split('/').at(-1),
  })
  if (!accept.ok) {
    throw new Error(`accept failed: ${String(accept.status)}`)
  }
  return client
}

/** The `error` code of a standard error envelope. */
export async function errorCodeOf(response: Response): Promise<string> {
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('error' in body) ||
    typeof body.error !== 'string'
  ) {
    throw new TypeError('response is not an error envelope')
  }
  return body.error
}

/** Signs up a verified owner and creates an organization; the common fixture for route tests. */
export async function signUpOwner(
  harness: { app: Hono<AppContext>; env: Env; mailbox: DevMailbox },
  owner: { name: string; email: string; password: string },
  organization: { name: string; slug: string },
): Promise<{ client: TestClient; organizationId: string }> {
  const client = new TestClient(harness.app, harness.env)
  await client.signUpAndVerify(harness.mailbox, owner)
  const organizationId = await client.createOrganization(organization.name, organization.slug)
  return { client, organizationId }
}

/** Extracts the first URL containing `pathFragment` from the newest mail to `to`. */
export function findLink(mailbox: DevMailbox, to: string, pathFragment: string): string {
  const message = mailbox.messages().find((candidate) => candidate.to === to)
  if (message === undefined) {
    throw new Error(`no email delivered to ${to}`)
  }
  const match = message.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(pathFragment))
  if (match === undefined) {
    throw new Error(`no link containing ${pathFragment} in email to ${to}`)
  }
  const url = new URL(match)
  return `${url.pathname}${url.search}`
}
