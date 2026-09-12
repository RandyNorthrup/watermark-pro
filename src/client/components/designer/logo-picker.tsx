import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LogoPrepare } from './logo-prepare'
import { SignaturePad } from './signature-pad'
import type { AssetDto } from '../../../shared/api'
import { BYTES_PER_MEGABYTE, LOGO_CONTENT_TYPES, MAX_LOGO_BYTES } from '../../../shared/constants'
import { describeError } from '../../lib/errors'
import { readImageSize } from '../../lib/image-size'
import {
  assetFileUrl,
  assetsQueryOptions,
  deleteLogo,
  libraryQueryKey,
  uploadLogo,
} from '../../lib/library'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

interface LogoPickerProps {
  organizationId: string
  assetId: string
  onChange: (assetId: string) => void
  canManage: boolean
}

const MAX_LOGO_MEGABYTES = MAX_LOGO_BYTES / BYTES_PER_MEGABYTE
const ACCEPT = LOGO_CONTENT_TYPES.join(',')

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** Organization logos as a radio grid, with upload and delete for managers. */
export function LogoPicker({ organizationId, assetId, onChange, canManage }: LogoPickerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const assets = useQuery(assetsQueryOptions(organizationId))
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  /** The chosen file awaiting the prepare step, or null when none is in progress. */
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: libraryQueryKey(organizationId) })
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_LOGO_BYTES) {
        throw new Error(t('designer.logo.tooLarge', { max: MAX_LOGO_MEGABYTES }))
      }
      let size
      try {
        size = await readImageSize(file)
      } catch {
        throw new Error(t('designer.notAnImage'))
      }
      return await uploadLogo(organizationId, { file, name: stripExtension(file.name), ...size })
    },
    onSuccess: async (asset) => {
      setUploadError(null)
      setPendingFile(null)
      onChange(asset.id)
      await invalidate()
    },
    onError: (error) => {
      setUploadError(describeError(error))
    },
  })

  /** A drawn signature arrives already sized and as a PNG; it only needs uploading. */
  const signature = useMutation({
    mutationFn: async ({ file, size }: { file: File; size: { width: number; height: number } }) =>
      await uploadLogo(organizationId, { file, name: stripExtension(file.name), ...size }),
    onSuccess: async (asset) => {
      setUploadError(null)
      onChange(asset.id)
      await invalidate()
    },
    onError: (error) => {
      setUploadError(describeError(error))
    },
  })

  const remove = useMutation({
    mutationFn: (asset: AssetDto) => deleteLogo(organizationId, asset.id),
    onSuccess: async (_result, asset) => {
      setUploadError(null)
      if (asset.id === assetId) {
        onChange('')
      }
      await invalidate()
    },
    onError: (error) => {
      setUploadError(describeError(error))
    },
  })

  if (assets.isPending) {
    return <Spinner className="size-5" label={t('designer.logo.loading')} />
  }
  if (assets.isError) {
    return (
      <Alert tone="error" title={t('designer.logo.loadError')}>
        {describeError(assets.error)}
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {assets.data.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('designer.logo.empty')}</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('designer.logo.choose')}</legend>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.data.map((asset) => (
              <li key={asset.id} className="relative">
                <button
                  type="button"
                  aria-pressed={asset.id === assetId}
                  aria-label={t('designer.logo.item', { name: asset.name })}
                  onClick={() => {
                    onChange(asset.id)
                  }}
                  className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface-raised p-2 text-start text-xs hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none aria-pressed:border-brand-500 aria-pressed:ring-2 aria-pressed:ring-brand-500/30 dark:hover:bg-brand-900/40"
                >
                  <span className="flex h-20 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                    <img
                      src={assetFileUrl(organizationId, asset.id)}
                      alt=""
                      className="max-h-16 max-w-full object-contain"
                    />
                  </span>
                  <span className="truncate font-medium">{asset.name}</span>
                  <span className="text-ink-muted">
                    {t('designer.logo.dimensions', { width: asset.width, height: asset.height })}
                  </span>
                </button>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('designer.logo.delete', { name: asset.name })}
                    className="absolute end-1 top-1 size-7 text-ink-muted hover:text-rose-600"
                    disabled={remove.isPending}
                    onClick={() => {
                      remove.mutate(asset)
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {canManage ? (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            aria-label={t('designer.logo.upload')}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file !== undefined) {
                setUploadError(null)
                setPendingFile(file)
              }
              event.currentTarget.value = ''
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center"
              isPending={upload.isPending}
              onClick={() => {
                inputRef.current?.click()
              }}
            >
              {upload.isPending ? null : <Upload aria-hidden="true" className="size-4" />}
              {t('designer.logo.uploadButton')}
            </Button>
            <SignaturePad
              className="w-full justify-center"
              isSaving={signature.isPending}
              onSave={async (file, size) => {
                await signature.mutateAsync({ file, size })
              }}
            />
          </div>
          <p className="text-xs text-ink-muted">
            {t('designer.logo.hint', { max: MAX_LOGO_MEGABYTES })}
          </p>
          {pendingFile === null ? null : (
            <LogoPrepare
              file={pendingFile}
              isSaving={upload.isPending}
              onPrepared={(prepared) => {
                upload.mutate(prepared)
              }}
              onCancel={() => {
                setPendingFile(null)
              }}
            />
          )}
        </div>
      ) : null}
      {uploadError === null ? null : <Alert tone="error">{uploadError}</Alert>}
    </div>
  )
}
