/** Stable public labels keep fixture identifiers and bearer tokens out of report paths and logs. */
export const PUBLIC_SURFACES = [
  { id: 'home', route: '/', heading: ['landing.heroTitleStart', 'landing.heroTitleEnd'] },
  { id: 'login', route: '/login', heading: 'auth.login.title' },
  { id: 'signup-invitation-required', route: '/signup', heading: 'auth.inviteOnly.title' },
  { id: 'forgot-password', route: '/forgot-password', heading: 'auth.forgotPassword.title' },
  { id: 'privacy', route: '/privacy', heading: 'legal.privacy.title' },
  { id: 'terms', route: '/terms', heading: 'legal.terms.title' },
]

export const WORKSPACE_SURFACES = [
  { id: 'dashboard', route: '/app', heading: 'dashboard.overviewHeading' },
  { id: 'members', route: '/app/members', heading: 'members.heading' },
  { id: 'audit', route: '/app/audit', heading: 'audit.heading' },
  { id: 'new-organization', route: '/app/organizations/new', heading: 'organizations.newTitle' },
  { id: 'library', route: '/app/library', heading: 'library.heading' },
  { id: 'bulk', route: '/app/bulk', heading: 'bulk.heading' },
  { id: 'gallery', route: '/app/gallery', heading: 'gallery.heading' },
  { id: 'shares', route: '/app/shares', heading: 'shares.heading' },
  { id: 'account', route: '/app/account', heading: 'accountAuth.heading' },
  { id: 'invitations', route: '/app/invitations', heading: 'siteInvites.heading' },
  { id: 'video', route: '/app/video', heading: 'video.heading' },
  { id: 'documents', route: '/app/documents', heading: 'documents.heading' },
  { id: 'verify', route: '/app/verify', heading: 'verify.tool.title' },
]

export const PREPARED_SURFACES = [
  { id: 'check-email', route: '/check-email', heading: 'verify.checkEmail.title' },
  { id: 'signup-valid-invitation', route: '/signup', heading: 'auth.signup.title' },
  { id: 'reset-password-valid', route: '/reset-password', heading: 'auth.resetPassword.title' },
  { id: 'reset-password-invalid', route: '/reset-password', heading: 'auth.resetPassword.title' },
  { id: 'accept-invitation', route: '/accept-invitation/$invitationId', heading: null },
  { id: 'share-public', route: '/share/$token', heading: null },
  { id: 'designer-new', route: '/app/library/new', heading: 'library.newPreset' },
  { id: 'designer-edit', route: '/app/library/$watermarkId', heading: null },
  { id: 'editor-watermark', route: '/app/editor', heading: 'editor.heading' },
  { id: 'admin-users', route: '/app/admin', heading: 'admin.heading' },
  { id: 'private-editor-empty', route: '/app/editor', heading: 'editor.heading' },
  ...['thumbnails', 'list', 'details'].map((view) => ({
    id: `library-recent-${view}`,
    route: '/app/library',
    heading: 'library.heading',
    view,
  })),
  ...['thumbnails', 'list', 'details'].map((view) => ({
    id: `gallery-recent-${view}`,
    route: '/app/gallery',
    heading: 'gallery.heading',
    view,
  })),
]

export const AUDIT_SURFACES = [...PUBLIC_SURFACES, ...WORKSPACE_SURFACES, ...PREPARED_SURFACES]

/** Resolve only own JSON catalogue fields; inherited properties cannot satisfy a UI assertion. */
export function auditLabel(catalogue, key) {
  let value = catalogue
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, part))
      throw new Error('Audit expectation has no translated label')
    value = Reflect.get(value, part)
  }
  if (typeof value !== 'string') throw new Error('Audit expectation has no translated label')
  return value
}

/** Reserve before writing: duplicate captures must fail instead of silently erasing earlier proof. */
export function reserveCapture(captures, key, record) {
  if (captures.has(key)) throw new Error(`Duplicate screenshot capture: ${key}`)
  captures.set(key, record)
}

/** Only declared stable names may enter output filenames and public diagnostic labels. */
export function requireSurface(id) {
  const surface = AUDIT_SURFACES.find((candidate) => candidate.id === id)
  if (surface === undefined) throw new Error('Unknown audit surface')
  return surface
}
