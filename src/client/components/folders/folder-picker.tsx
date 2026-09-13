import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NewFolderDialog } from './new-folder-dialog'
import type { FolderDto, FolderKind } from '../../../shared/folders'
import { cn } from '../../lib/cn'
import { excludedFolderDestinations, folderPath } from '../../lib/folder-tree'
import { foldersQueryOptions } from '../../lib/folders'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'

interface FolderPickerProps {
  organizationId: string
  kind: FolderKind
  value: string | null
  onChange: (folderId: string | null) => void
  label?: string
  excludedId?: string
  disabled?: boolean
  canCreate?: boolean
}

/** Inline disclosure keeps folder selection usable inside save dialogs and narrow tool panels. */
export function FolderPicker({
  organizationId,
  kind,
  value,
  onChange,
  label,
  excludedId,
  disabled = false,
  canCreate = false,
}: FolderPickerProps) {
  const { t } = useTranslation()
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const folders = useQuery({
    ...foldersQueryOptions(organizationId, kind),
    enabled: organizationId !== '',
  })
  const items = folders.data ?? []
  const excluded = useMemo(
    () => excludedFolderDestinations(folders.data ?? [], excludedId),
    [folders.data, excludedId],
  )
  const path = folderPath(items, value)
  const rootName = t(kind === 'photo' ? 'folders.rootPhoto' : 'folders.rootPreset')
  const selection = value === null ? rootName : (path?.at(-1)?.name ?? t('folders.choose'))
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label ?? t('folders.destination')}
      </label>
      <Button
        id={id}
        variant="secondary"
        size="sm"
        className="w-full justify-between"
        disabled={disabled}
        aria-expanded={expanded}
        aria-controls={`${id}-tree`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{selection}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </Button>
      {expanded ? (
        <div
          id={`${id}-tree`}
          className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface/70 p-1"
        >
          {folders.isPending ? (
            <p role="status" className="p-2 text-xs text-ink-muted">
              {t('folders.loading')}
            </p>
          ) : null}
          {folders.isError ? <Alert tone="error">{t('folders.loadError')}</Alert> : null}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            aria-pressed={value === null}
            onClick={() => {
              onChange(null)
              setExpanded(false)
            }}
          >
            <Folder aria-hidden="true" className="size-4 shrink-0" />
            {rootName}
          </Button>
          <FolderTree
            items={items}
            parentId={null}
            selected={value}
            excluded={excluded}
            onSelect={(folderId) => {
              onChange(folderId)
              setExpanded(false)
            }}
          />
          {canCreate && (path !== null || value === null) ? (
            <div className="mt-2 flex justify-center border-t border-line pt-2">
              <NewFolderDialog
                key={`${organizationId}-${value ?? 'root'}`}
                organizationId={organizationId}
                kind={kind}
                parentId={value}
                onCreated={(folder) => {
                  onChange(folder.id)
                  setExpanded(false)
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {path === null && value !== null && folders.isSuccess ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {t('folders.unavailable')}
        </p>
      ) : null}
    </div>
  )
}

/** Native disclosure buttons expose the tree without imposing an incomplete ARIA tree keyboard model. */
function FolderTree({
  items,
  parentId,
  selected,
  excluded,
  onSelect,
  ancestors = [],
}: {
  items: readonly FolderDto[]
  parentId: string | null
  selected: string | null
  excluded: ReadonlySet<string>
  onSelect: (id: string) => void
  ancestors?: readonly string[]
}) {
  const children = items
    .filter((item) => item.parentId === parentId && !ancestors.includes(item.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))
  return (
    <ul className={cn(parentId !== null && 'ms-3 border-s border-line ps-2')}>
      {children.map((folder) => (
        <FolderBranch
          key={folder.id}
          folder={folder}
          items={items}
          selected={selected}
          excluded={excluded}
          onSelect={onSelect}
          ancestors={ancestors}
        />
      ))}
    </ul>
  )
}

function FolderBranch({
  folder,
  items,
  selected,
  excluded,
  onSelect,
  ancestors,
}: {
  folder: FolderDto
  items: readonly FolderDto[]
  selected: string | null
  excluded: ReadonlySet<string>
  onSelect: (id: string) => void
  ancestors: readonly string[]
}) {
  const { t } = useTranslation()
  const selectedPath = folderPath(items, selected)
  const [open, setOpen] = useState(selectedPath?.some((item) => item.id === folder.id) ?? false)
  const hasChildren = items.some((item) => item.parentId === folder.id)
  const isDisabled = excluded.has(folder.id)
  return (
    <li>
      <div className="flex min-w-0 items-center">
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-expanded={open}
            aria-label={t(open ? 'folders.collapse' : 'folders.expand', { name: folder.name })}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-3.5 transition-transform rtl:rotate-180',
                open && 'rotate-90 rtl:rotate-90',
              )}
            />
          </Button>
        ) : (
          <span className="w-10 shrink-0" />
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'min-w-0 flex-1 justify-start',
            selected === folder.id && 'bg-brand-600/15 text-brand-700 dark:text-brand-200',
          )}
          disabled={isDisabled}
          aria-pressed={selected === folder.id}
          onClick={() => onSelect(folder.id)}
        >
          <Folder aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </Button>
      </div>
      {hasChildren && open ? (
        <FolderTree
          items={items}
          parentId={folder.id}
          selected={selected}
          excluded={excluded}
          onSelect={onSelect}
          ancestors={[...ancestors, folder.id]}
        />
      ) : null}
    </li>
  )
}
