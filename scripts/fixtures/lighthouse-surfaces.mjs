import { randomUUID } from 'node:crypto'

import { request } from '@playwright/test'

import {
  auditCookies,
  auditOrigin,
  createAuditAccount,
  createAuditReset,
  fixtureJson,
  fixtureLink,
} from './audit-accounts.mjs'
import { ensureTestSiteOwner } from '../lib/test-site-owner.ts'

const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const PRESET_NAME = 'Studio signature'
const ALBUM_NAME = 'Client preview'
const STUDIO_NAME = 'Audit Studio'
const PRESET_SPEC = {
  kind: 'text',
  text: '© Audit Studio',
  fontFamily: 'Inter Variable',
  fontWeight: 600,
  letterSpacing: 0,
  curve: 0,
  effect: 'solid',
  placement: { mode: 'smart' },
  contrast: { mode: 'auto' },
  style: {
    opacity: 0.85,
    rotation: 0,
    scale: 0.22,
    margin: 0.04,
    tiling: { enabled: false, spacing: 1.5 },
    backdrop: { enabled: false, opacity: 0.6 },
  },
}

/** All page states use real API-created local records. No production identity or mocked response is used. */
export async function prepareLighthouseSurfaces(origin, surfaces) {
  const base = auditOrigin(origin)
  const contexts = []
  try {
    const owner = await ensureTestSiteOwner(base)
    const member = await createAuditAccount(base)
    contexts.push(member.context)
    const empty = await createAuditAccount(base, 'Empty Audit')
    contexts.push(empty.context)
    const collaborator = await createAuditAccount(base, 'Alex Audit')
    contexts.push(collaborator.context)

    const studioContext = await request.newContext({
      baseURL: base,
      extraHTTPHeaders: { origin: base },
    })
    contexts.push(studioContext)
    await fixtureJson(await studioContext.post('/api/auth/sign-in/email', { data: member.person }))
    const studio = await fixtureJson(
      await studioContext.post('/api/auth/organization/create', {
        data: { name: STUDIO_NAME, slug: `audit-${randomUUID()}` },
      }),
    )
    await fixtureJson(
      await studioContext.post('/api/auth/organization/set-active', {
        data: { organizationId: studio.id },
      }),
    )
    await fixtureJson(
      await studioContext.post('/api/auth/organization/invite-member', {
        data: { organizationId: studio.id, email: collaborator.person.email, role: 'editor' },
      }),
    )
    const acceptPath = await fixtureLink(
      collaborator.context,
      base,
      collaborator.person.email,
      '/accept-invitation/',
    )
    const inviteEmail = `invited-${randomUUID()}@example.test`
    await fixtureJson(
      await member.context.post('/api/me/invitations', { data: { email: inviteEmail } }),
    )
    const signupPath = await fixtureLink(member.context, base, inviteEmail, '/signup?invitation=')
    const resetPath = await createAuditReset(member.context, base, member.person.email)
    const root = `/api/orgs/${member.organizationId}`
    const preset = await fixtureJson(
      await member.context.post(`${root}/watermarks`, {
        data: { name: PRESET_NAME, spec: PRESET_SPEC },
      }),
    )
    const photo = await fixtureJson(
      await member.context.post(`${root}/photos`, {
        multipart: {
          file: { name: 'audit.png', mimeType: 'image/png', buffer: PHOTO },
          thumbnail: { name: 'thumb.png', mimeType: 'image/png', buffer: PHOTO },
          name: 'Audit photo',
          width: '1',
          height: '1',
        },
      }),
    )
    const share = await fixtureJson(
      await member.context.post(`${root}/shares`, {
        data: { title: ALBUM_NAME, photoIds: [photo.id] },
      }),
    )
    const shareUrl = new URL(share.url)
    if (shareUrl.origin !== base || !shareUrl.pathname.startsWith('/share/'))
      throw new Error('Audit share returned an unexpected origin or route')
    for (const activity of [
      { kind: 'preset', resourceId: preset.id },
      { kind: 'photo', resourceId: photo.id },
    ]) {
      const recorded = await member.context.post(`${root}/recent-work`, {
        data: { ...activity, usedAt: new Date().toISOString() },
      })
      if (recorded.status() !== 204) throw new Error('Audit recent activity was not recorded')
    }
    const recent = await fixtureJson(await member.context.get(`${root}/recent-work`))
    if (
      recent.items.every((item) => !(item.kind === 'photo' && item.photo.id === photo.id)) ||
      recent.items.every((item) => !(item.kind === 'preset' && item.preset.id === preset.id))
    )
      throw new Error('Audit fixtures did not record real recent work')
    const memberCookie = await auditCookies(member.context)
    const studioCookie = await auditCookies(studioContext)
    const prepared = surfaces.map((surface) => ({
      ...surface,
      pathname: surface.route,
      cookie: surface.route.startsWith('/app') ? memberCookie : '',
      checks: [],
    }))
    async function prepare(surface) {
      switch (surface.id) {
        case 'home':
        case 'login':
        case 'signup-invitation-required':
        case 'forgot-password':
        case 'privacy':
        case 'terms': {
          break
        }
        case 'check-email': {
          surface.pathname = `/check-email?email=${encodeURIComponent(member.person.email)}`
          break
        }
        case 'signup-valid-invitation': {
          surface.pathname = signupPath
          surface.checks.push({ label: 'auth.signup.nameLabel' })
          break
        }
        case 'reset-password-valid': {
          surface.pathname = resetPath
          surface.checks.push({ label: 'auth.resetPassword.newPasswordLabel' })
          break
        }
        case 'reset-password-invalid': {
          surface.checks.push({ textKey: 'auth.resetPassword.invalidTitle' })
          break
        }
        case 'accept-invitation': {
          surface.pathname = acceptPath
          surface.cookie = await auditCookies(collaborator.context)
          surface.headingText = `Join ${STUDIO_NAME}`
          surface.checks.push({ role: 'button', nameKey: 'auth.acceptInvitation.accept' })
          break
        }
        case 'share-public': {
          surface.pathname = `${shareUrl.pathname}${shareUrl.search}`
          surface.headingText = ALBUM_NAME
          break
        }
        case 'designer-edit': {
          surface.pathname = `/app/library/${preset.id}`
          surface.headingText = PRESET_NAME
          surface.checks.push({ label: 'designer.presetName', value: PRESET_NAME })
          break
        }
        case 'admin-users': {
          surface.cookie = owner.cookie
          break
        }
        case 'members':
        case 'audit': {
          surface.cookie = studioCookie
          break
        }
        case 'private-dashboard-empty': {
          surface.cookie = await auditCookies(empty.context)
          surface.headingText = 'My workspace'
          surface.checks.push({ textKey: 'recent.empty' })
          break
        }
        case 'dashboard':
        case 'recent-thumbnails':
        case 'recent-list':
        case 'recent-details': {
          surface.headingText = 'My workspace'
          surface.checks.push({ role: 'region', nameKey: 'recent.heading', contains: PRESET_NAME })
          surface.view ??= 'thumbnails'
          surface.checks.push({
            role: 'button',
            nameKey: `recent.views.${surface.view}`,
            pressed: true,
          })
          break
        }
        default: {
          if (surface.route.includes('$'))
            throw new Error('Dynamic audit surface lacks a real fixture')
        }
      }
    }
    await Promise.all(prepared.map(async (surface) => await prepare(surface)))
    return {
      surfaces: prepared,
      async before(surface) {
        if (surface.view !== undefined)
          await fixtureJson(
            await member.context.patch('/api/me/recent-view', { data: { view: surface.view } }),
          )
      },
      async dispose() {
        await Promise.all(contexts.map(async (context) => await context.dispose()))
      },
    }
  } catch (error) {
    await Promise.all(contexts.map(async (context) => await context.dispose()))
    throw error
  }
}
