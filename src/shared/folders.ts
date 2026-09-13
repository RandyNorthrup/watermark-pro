/** Workspace folders organize saved outputs and presets without changing content permissions. */
import { z } from 'zod'

import { accountIdSchema } from './account-identity'

export const FOLDER_POLICY = {
  nameLength: 100,
  maxFolders: 1000,
  maxDepth: 12,
  maxMoveItems: 500,
  requestBytes: 131_072,
} as const

const folderKindSchema = z.enum(['photo', 'preset'])
export type FolderKind = z.infer<typeof folderKindSchema>
export const folderIdSchema = z.uuid()
export const folderRevisionSchema = z.number().int().nonnegative()
export const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(FOLDER_POLICY.nameLength)
  .regex(/^[^/\\\p{Cc}]+$/u)
  .refine((name) => name !== '.' && name !== '..', 'Choose a folder name')

/** Stable Unicode normalization makes sibling-name comparisons independent of UI locale. */
export function folderNameKey(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase('en-US')
}

export const folderDtoSchema = z.object({
  id: folderIdSchema,
  organizationId: accountIdSchema,
  kind: folderKindSchema,
  name: folderNameSchema,
  parentId: folderIdSchema.nullable(),
  revision: folderRevisionSchema,
  versionId: folderIdSchema,
  createdBy: z.nullable(accountIdSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  childCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
})
export type FolderDto = z.infer<typeof folderDtoSchema>
export const folderListSchema = z.object({ folders: z.array(folderDtoSchema) })
export const folderListQuerySchema = z.object({ kind: folderKindSchema })
export const folderCreateSchema = z.object({
  id: folderIdSchema,
  kind: folderKindSchema,
  name: folderNameSchema,
  parentId: folderIdSchema.nullable(),
})
export const folderUpdateSchema = z.object({
  name: folderNameSchema,
  parentId: folderIdSchema.nullable(),
  expectedRevision: folderRevisionSchema,
  expectedVersionId: folderIdSchema,
})
export const folderDeleteSchema = z.object({
  expectedRevision: folderRevisionSchema,
  expectedVersionId: folderIdSchema,
})
const moveItemSchema = z.object({
  id: accountIdSchema,
  expectedFolderRevision: folderRevisionSchema,
  expectedFolderVersionId: folderIdSchema.nullable().default(null),
})
export const contentMoveSchema = z
  .object({
    kind: folderKindSchema,
    folderId: folderIdSchema.nullable(),
    items: z.array(moveItemSchema).min(1).max(FOLDER_POLICY.maxMoveItems),
  })
  .refine(
    (input) => new Set(input.items.map((item) => item.id)).size === input.items.length,
    'Choose each item once',
  )
export const contentPlacementSchema = z.object({
  id: accountIdSchema,
  organizationId: accountIdSchema,
  kind: folderKindSchema,
  folderId: folderIdSchema.nullable(),
  folderRevision: folderRevisionSchema,
  folderVersionId: folderIdSchema,
})
export const folderWriteResultSchema = z.object({
  folder: folderDtoSchema.nullable(),
  moved: z.array(contentPlacementSchema),
})
export type FolderWriteResult = z.infer<typeof folderWriteResultSchema>
export type FolderCreate = z.infer<typeof folderCreateSchema>
export type FolderUpdate = z.infer<typeof folderUpdateSchema>
export type ContentMove = z.infer<typeof contentMoveSchema>
