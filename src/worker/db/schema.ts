/**
 * D1 schema. The Better Auth tables (user, session, account, verification,
 * organization, member, invitation) follow the shapes the Better Auth CLI
 * generates for the enabled plugins; `npm run auth:schema:check` regenerates
 * them and fails if this file has drifted. `audit_log` is ours.
 *
 * Column naming is snake_case in the database and camelCase in code.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
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
  ],
)

/** Saved watermark presets (PLAN.md R3). */
export const watermark = sqliteTable(
  'watermark',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    spec: text('spec', { mode: 'json' }).$type<WatermarkSpec>().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn({ hasInsertDefault: true }),
  },
  (table) => [index('watermark_organization_id_idx').on(table.organizationId)],
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
