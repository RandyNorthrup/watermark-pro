/**
 * D1 schema. The Better Auth tables (user, session, account, verification,
 * organization, member, invitation) follow the shapes the Better Auth CLI
 * generates for the enabled plugins; `npm run auth:schema:check` regenerates
 * them and fails if this file has drifted. `audit_log` is ours.
 *
 * Column naming is snake_case in the database and camelCase in code.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

import type {
  CloudAttemptState,
  CloudConnectionState,
  CloudProvider,
} from '../../shared/cloud-connections'
import type { GuidanceTopic } from '../../shared/guidance'
import type { RecentActivity, RecentView } from '../../shared/recent-work'
import type { AssignableSiteRole } from '../../shared/site-roles'
import type { WatermarkSpec } from '../../shared/watermark'

const now = () => new Date()

/** Millisecond timestamp set on insert. */
function createdAtColumn() {
  return integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(now).notNull()
}

/** Millisecond timestamp refreshed by drizzle on every update. */
function updatedAtColumn(options: { hasInsertDefault: boolean }) {
  const column = integer('updated_at', { mode: 'timestamp_ms' }).$onUpdate(now).notNull()
  return options.hasInsertDefault ? column.$defaultFn(now) : column
}

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
    image: text('image'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
    role: text('role'),
    banned: integer('banned', { mode: 'boolean' }).default(false),
    banReason: text('ban_reason'),
    banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
    /**
     * Saved interface language (M18); null until the user picks one. Registered
     * as a Better Auth additional field in `auth/options.ts` and validated there
     * against `SUPPORTED_LOCALES`, so only a shipped locale code is ever stored.
     */
    locale: text('locale'),
  },
  (table) => [
    uniqueIndex('user_email_unique').on(table.email),
    uniqueIndex('user_single_site_owner')
      .on(sql`(1)`)
      .where(sql`${table.role} = 'owner'`),
  ],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: false }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
    activeOrganizationId: text('active_organization_id'),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_idx').on(table.userId),
  ],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    /** Identity provider issuer; scopes accountId since Better Auth 1.7. */
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: false }),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_issuer_account_id_unique').on(table.issuer, table.accountId),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const organization = sqliteTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    metadata: text('metadata'),
  },
  (table) => [uniqueIndex('organization_slug_unique').on(table.slug)],
)

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('viewer').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('member_organization_id_idx').on(table.organizationId),
    index('member_user_id_idx').on(table.userId),
  ],
)

export const invitation = sqliteTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAtColumn(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
)

/**
 * Append-only record of every mutating action. Rows are never updated or
 * deleted by the application; retention is an operator decision (PLAN.md Q3).
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id'),
    actorUserId: text('actor_user_id'),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('audit_log_organization_id_created_at_idx').on(table.organizationId, table.createdAt),
    index('audit_log_actor_action_created_at_idx').on(
      table.actorUserId,
      table.action,
      table.createdAt,
    ),
  ],
)

/** Workspace-owned folders; mutations validate parent scope and cycles before committing. */
export const workspaceFolder = sqliteTable(
  'workspace_folder',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'photo' | 'preset'>().notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    parentId: text('parent_id').references((): AnySQLiteColumn => workspaceFolder.id, {
      onDelete: 'no action',
    }),
    revision: integer('revision').default(0).notNull(),
    versionId: text('version_id').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
  },
  (table) => [
    uniqueIndex('workspace_folder_sibling_unique').on(
      table.organizationId,
      table.kind,
      sql`coalesce(${table.parentId}, '')`,
      table.nameKey,
    ),
    index('workspace_folder_parent_idx').on(table.organizationId, table.kind, table.parentId),
    check('workspace_folder_kind', sql`${table.kind} in ('photo', 'preset')`),
  ],
)

/** Each content table gets independent column builders with the same placement contract. */
function folderPlacementColumns() {
  return {
    folderId: text('folder_id').references(() => workspaceFolder.id, { onDelete: 'no action' }),
    folderRevision: integer('folder_revision').default(0).notNull(),
    folderVersionId: text('folder_version_id'),
  }
}

/** Saved watermark presets (PLAN.md R3). */
export const watermark = sqliteTable(
  'watermark',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    ...folderPlacementColumns(),
    name: text('name').notNull(),
    spec: text('spec', { mode: 'json' }).$type<WatermarkSpec>().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
  },
  (table) => [
    index('watermark_organization_id_idx').on(table.organizationId),
    index('watermark_folder_idx').on(table.organizationId, table.folderId),
  ],
)

/** Binary assets owned by an organization; bytes live in R2 under `key`. */
export const asset = sqliteTable(
  'asset',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** `logo` for watermark images; photos arrive in M6 with their own table. */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Pixel dimensions as reported by the uploading client (display only). */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
  },
  (table) => [index('asset_organization_id_kind_idx').on(table.organizationId, table.kind)],
)

/**
 * Watermarked photos stored by an organization (PLAN.md R6). The full-size
 * output and its thumbnail both live in R2; `presetId` records which preset
 * produced it and survives the preset's deletion.
 */
export const photo = sqliteTable(
  'photo',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    ...folderPlacementColumns(),
    name: text('name').notNull(),
    key: text('key').notNull(),
    thumbnailKey: text('thumbnail_key').notNull(),
    thumbnailSize: integer('thumbnail_size').notNull().default(0),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Pixel dimensions as reported by the uploading client (display only). */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    presetId: text('preset_id').references(() => watermark.id, { onDelete: 'set null' }),
    presetName: text('preset_name'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('photo_organization_id_created_at_idx').on(table.organizationId, table.createdAt),
    index('photo_organization_id_preset_id_idx').on(table.organizationId, table.presetId),
    index('photo_folder_created_id_idx').on(
      table.organizationId,
      table.folderId,
      table.createdAt,
      table.id,
    ),
  ],
)

/**
 * Share links (PLAN.md R7): a set of photo ids published under a signed
 * token. The token is derived from `id` and `expiresAt`, so nothing secret
 * is stored; `revokedAt` closes the link regardless of the token.
 */
export const share = sqliteTable(
  'share',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    photoIds: text('photo_ids', { mode: 'json' }).$type<string[]>().notNull(),
    /** Unix seconds; 0 means the link never expires. */
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index('share_organization_id_created_at_idx').on(table.organizationId, table.createdAt),
  ],
)

/**
 * Uncaught client errors reported by the browser (M19 observability). Bounded
 * and low-PII: the message, the single top stack frame, the route, the request
 * id (to tie back to a Worker log line) and — when signed in — the user id.
 * Rows older than the retention window are pruned on insert.
 */
export const clientError = sqliteTable(
  'client_error',
  {
    id: text('id').primaryKey(),
    message: text('message').notNull(),
    /** The single top stack frame, or null; never the full stack. */
    source: text('source'),
    /** The client route the error happened on. */
    route: text('route'),
    userAgent: text('user_agent'),
    /** Correlation id echoed by the Worker as `X-Request-Id`, when known. */
    requestId: text('request_id'),
    userId: text('user_id'),
    createdAt: createdAtColumn(),
  },
  (table) => [index('client_error_created_at_idx').on(table.createdAt)],
)

/**
 * Result of the scheduled health check (M19): a cron trigger fetches
 * `/api/health` and does one D1 read every few minutes and records the outcome
 * here so the admin console can show recent uptime without any dashboard. Rows
 * older than the retention window are pruned on insert.
 */
export const healthCheck = sqliteTable(
  'health_check',
  {
    id: text('id').primaryKey(),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    /** Failure detail when `ok` is false; null on success. */
    detail: text('detail'),
    durationMs: integer('duration_ms').notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [index('health_check_created_at_idx').on(table.createdAt)],
)

/** Site admission never creates a membership in the inviter's workspace. */
export const siteInvitation = sqliteTable(
  'site_invitation',
  {
    id: text('id').primaryKey(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').$type<AssignableSiteRole>().notNull().default('user'),
    tokenHash: text('token_hash').notNull(),
    referralId: text('referral_id').references(() => referralLink.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    acceptedUserId: text('accepted_user_id').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('site_invitation_token_unique').on(table.tokenHash),
    index('site_invitation_inviter_idx').on(table.inviterId),
  ],
)

/** One default personal workspace per account, private unless its owner explicitly grants access. */
export const privateWorkspace = sqliteTable(
  'private_workspace',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
  },
  (table) => [uniqueIndex('private_workspace_organization_unique').on(table.organizationId)],
)

/** Rotatable reusable site-admission link. No recipient identity is exposed to its owner. */
export const referralLink = sqliteTable(
  'referral_link',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAtColumn(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('referral_link_user_unique').on(table.userId),
    uniqueIndex('referral_link_token_unique').on(table.tokenHash),
  ],
)

/** Pending rows reserve quota; cleanup rows retain the charge until R2 deletion succeeds. */
export const uploadReservation = sqliteTable(
  'upload_reservation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    uploadId: text('upload_id').notNull(),
    kind: text('kind').notNull(),
    userId: text('user_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    keys: text('keys', { mode: 'json' }).$type<string[]>().notNull(),
    bytes: integer('bytes').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('upload_reservation_org_idx').on(table.organizationId),
    index('upload_reservation_expiry_idx').on(table.status, table.expiresAt),
    uniqueIndex('upload_reservation_pending_unique')
      .on(table.organizationId, table.kind, table.uploadId)
      .where(sql`${table.status} = 'pending'`),
  ],
)

/** The site's immutable owner is an anchored account, separate from workspace ownership. */
export const siteOwner = sqliteTable(
  'site_owner',
  {
    id: integer('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (table) => [check('site_owner_singleton', sql`${table.id} = 1`)],
)

/** Resource IDs are polymorphic; the route rechecks current access before returning metadata. */
export const recentActivity = sqliteTable(
  'recent_activity',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<RecentActivity['kind']>().notNull(),
    resourceId: text('resource_id').notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('recent_activity_owner_org_time').on(table.userId, table.organizationId, table.usedAt),
    uniqueIndex('recent_activity_resource_unique').on(
      table.userId,
      table.organizationId,
      table.kind,
      table.resourceId,
    ),
    check('recent_activity_kind', sql`${table.kind} in ('photo', 'preset')`),
  ],
)

/** Interface preference follows the account; another account never inherits it. */
export const recentViewPreference = sqliteTable(
  'recent_view_preference',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    view: text('view').$type<RecentView>().notNull(),
  },
  (table) => [check('recent_view_valid', sql`${table.view} in ('thumbnails', 'list', 'details')`)],
)

/** Permanent per-account consumption; there is deliberately no application delete/update path. */
export const guidanceClaim = sqliteTable(
  'guidance_claim',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    topic: text('topic').$type<GuidanceTopic>().notNull(),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }).$defaultFn(now).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topic] })],
)

/** Explicit workspace grants remain separate from site admission and account credentials. */
export const workspaceAccessLink = sqliteTable(
  'workspace_access_link',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    role: text('role').$type<'viewer' | 'editor'>().notNull(),
    email: text('email'),
    createdAt: createdAtColumn(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    acceptedUserId: text('accepted_user_id').references(() => user.id, { onDelete: 'set null' }),
    siteInvitationId: text('site_invitation_id').references(() => siteInvitation.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('workspace_access_link_token_unique').on(table.tokenHash),
    index('workspace_access_link_workspace_idx').on(table.organizationId),
    check('workspace_access_link_role', sql`${table.role} in ('viewer', 'editor')`),
  ],
)

/** Durable provider credentials are account-owned even when workspace content is shared. */
export const cloudConnection = sqliteTable(
  'cloud_connection',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<CloudProvider>().notNull(),
    status: text('status').$type<CloudConnectionState>().default('disconnected').notNull(),
    generation: integer('generation').default(0).notNull(),
    clientId: text('client_id'),
    providerAccountId: text('provider_account_id'),
    accountLabel: text('account_label'),
    accessCipher: text('access_cipher'),
    refreshCipher: text('refresh_cipher'),
    accessExpiresAt: integer('access_expires_at', { mode: 'timestamp_ms' }),
    scopes: text('scopes').default('').notNull(),
    refreshLeaseId: text('refresh_lease_id'),
    refreshLeaseExpiresAt: integer('refresh_lease_expires_at', { mode: 'timestamp_ms' }),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    check('cloud_connection_provider', sql`${table.provider} in ('google', 'dropbox', 'onedrive')`),
    check(
      'cloud_connection_status',
      sql`${table.status} in ('disconnected', 'connected', 'reconnect')`,
    ),
  ],
)

/** State hashes and encrypted PKCE verifiers expire; a callback is claimed atomically once. */
export const cloudAttempt = sqliteTable(
  'cloud_attempt',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<CloudProvider>().notNull(),
    stateHash: text('state_hash').notNull(),
    verifierCipher: text('verifier_cipher').notNull(),
    generation: integer('generation').notNull(),
    status: text('status').$type<CloudAttemptState>().default('pending').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('cloud_attempt_state_unique').on(table.stateHash),
    index('cloud_attempt_expiry_idx').on(table.expiresAt),
    index('cloud_attempt_owner_provider_idx').on(table.userId, table.provider),
  ],
)
