import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ensureTestSiteOwner, TEST_SITE_OWNER } from './lib/test-site-owner.ts'

const ORIGIN = 'http://localhost:5273'
const OWNER_ID = 'synthetic-site-owner'

function gateFixture(
  t,
  {
    fresh = false,
    role = 'owner',
    email = TEST_SITE_OWNER.email,
    sessionUserId = OWNER_ID,
    promotionStatus = 200,
    sessionStatus = 200,
    isSessionVerified = true,
  } = {},
) {
  let isVerified = !fresh
  let isVerificationSent = false
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input)
    const headers = new Headers(init.headers)
    const body = init.body === undefined ? undefined : JSON.parse(init.body)
    requests.push({
      pathname: url.pathname,
      search: url.search,
      method: init.method,
      headers,
      body,
    })
    assert.equal(url.origin, ORIGIN)
    assert.equal(headers.get('origin'), ORIGIN)
    switch (url.pathname) {
      case '/api/dev/mailbox': {
        return Response.json({
          messages: isVerificationSent
            ? [
                {
                  to: TEST_SITE_OWNER.email,
                  text: `${ORIGIN}/api/auth/verify-email?token=synthetic-verification`,
                },
              ]
            : [],
        })
      }
      case '/api/auth/sign-in/email': {
        return isVerified
          ? Response.json(
              { user: { id: OWNER_ID } },
              { headers: { 'set-cookie': 'owner-session=synthetic-session; Path=/' } },
            )
          : Response.json({ error: 'not_verified' }, { status: 401 })
      }
      case '/api/auth/sign-up/email': {
        return Response.json({ user: { id: OWNER_ID } })
      }
      case '/api/auth/send-verification-email': {
        isVerificationSent = true
        return Response.json({ status: true })
      }
      case '/api/auth/verify-email': {
        isVerified = true
        return new Response(null, { status: 302, headers: { location: '/app' } })
      }
      case '/api/dev/promote':
      case '/api/dev/promote-site-owner': {
        return Response.json({ promoted: promotionStatus === 200 }, { status: promotionStatus })
      }
      case '/api/auth/get-session': {
        assert.equal(url.searchParams.get('disableCookieCache'), 'true')
        assert.equal(headers.get('cookie'), 'owner-session=synthetic-session')
        return Response.json(
          {
            session: { userId: sessionUserId },
            user: { id: OWNER_ID, email, emailVerified: isVerified && isSessionVerified, role },
          },
          {
            status: sessionStatus,
            headers: { 'set-cookie': 'owner-session=fresh-synthetic-session; Path=/' },
          },
        )
      }
      case '/api/me/workspace': {
        assert.equal(headers.get('cookie'), 'owner-session=fresh-synthetic-session')
        return Response.json(
          { organizationId: 'synthetic-private-workspace' },
          { headers: { 'set-cookie': 'workspace-session=synthetic-workspace; Path=/' } },
        )
      }
      default: {
        throw new Error('Unexpected synthetic gate request.')
      }
    }
  })
  return requests
}

test('fresh gate verifies email then establishes and checks the exact global owner', async (t) => {
  const requests = gateFixture(t, { fresh: true })
  const result = await ensureTestSiteOwner(ORIGIN)
  assert.equal(result.organizationId, 'synthetic-private-workspace')
  assert.match(result.cookie, /owner-session=fresh-synthetic-session/)
  assert.match(result.cookie, /workspace-session=synthetic-workspace/)
  const promotion = requests.find((request) => request.pathname === '/api/dev/promote-site-owner')
  assert.ok(promotion)
  assert.equal(promotion.method, 'POST')
  assert.deepEqual(promotion.body, { email: TEST_SITE_OWNER.email })
  assert.equal(
    requests.some((request) => request.pathname === '/api/dev/promote'),
    false,
  )
  assert.equal(requests.filter((request) => request.pathname === '/api/auth/get-session').length, 1)
})

test('existing verified owner signs in without generating another account or verification message', async (t) => {
  const requests = gateFixture(t)
  await ensureTestSiteOwner(ORIGIN)
  assert.equal(
    requests.some((request) => request.pathname === '/api/auth/sign-up/email'),
    false,
  )
  assert.equal(
    requests.some((request) => request.pathname === '/api/auth/send-verification-email'),
    false,
  )
  assert.equal(requests.filter((request) => request.pathname === '/api/auth/get-session').length, 1)
})

for (const invalid of [
  { role: 'admin' },
  { role: 'user' },
  { role: 'owner,admin' },
  { email: 'another@example.test' },
  { sessionUserId: 'another-user' },
  { sessionStatus: 401 },
  { isSessionVerified: false },
]) {
  test(`rejects a successful promotion with a wrong owner session (${JSON.stringify(invalid)})`, async (t) => {
    const requests = gateFixture(t, invalid)
    await assert.rejects(ensureTestSiteOwner(ORIGIN), /verified synthetic site owner/)
    assert.equal(
      requests.some((request) => request.pathname === '/api/me/workspace'),
      false,
    )
  })
}

test('another anchored owner is refused before private workspace setup', async (t) => {
  const requests = gateFixture(t, { promotionStatus: 403 })
  await assert.rejects(ensureTestSiteOwner(ORIGIN), /another site owner/)
  assert.equal(
    requests.some((request) => request.pathname === '/api/me/workspace'),
    false,
  )
})

test('non-loopback and ambiguous fixture origins are refused before any request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Fixture origin guard failed.')
  })
  for (const origin of [
    'https://lumafoil.com',
    'http://localhost:5273/app',
    'http://user:password@localhost:5273',
    'http://localhost:5273/?query=1',
  ]) {
    await assert.rejects(ensureTestSiteOwner(origin), /restricted to a loopback HTTP gate origin/)
  }
  assert.equal(fetch.mock.callCount(), 0)
})
