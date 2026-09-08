import { Download, Images, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FORMAT_OPTIONS } from './formats'
import { MetadataPolicyField } from './metadata-policy'
import type { PublicConfig } from '../../../shared/api'
import { CLOUD_SAVE_FOLDER, MAX_INVISIBLE_MESSAGE_LENGTH } from '../../../shared/constants'
import {
  DEFAULT_METADATA_POLICY,
  effectivePolicy,
  type EncodeOptions,
  type MetadataPolicy,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '../../engine/encode'
import { invisibleCapacity } from '../../engine/invisible'
import type { Size } from '../../engine/layout'
import { PROVIDER_LABELS, type CloudUpload } from '../../lib/imports/source'
import { canShareFiles } from '../../lib/share-file'
import { CloudSaveButtons } from '../import/cloud-save-buttons'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { SliderField } from '../ui/slider-field'

interface ExportPanelProps {
  outputSize: Size
  isReady: boolean
  isExporting: boolean
  onExport: (options: EncodeOptions) => void
  /** Hands the render to the platform share sheet; shown only where the browser can share files. */
  onShare: (options: EncodeOptions) => void
  isSharing: boolean
  /** Present when the user may store photos in the gallery. */
  onSave?: ((options: EncodeOptions) => void) | undefined
  isSaving?: boolean | undefined
  /** Seeds the default hidden-mark message; the workspace name identifies the owner. */
  organizationName: string
  /** Public config; when it has configured cloud providers, "Save to cloud" buttons appear. */
  cloudConfig?: PublicConfig | undefined
  /** Renders the current photo at full resolution for a cloud save; null when nothing is loaded. */
  onExportBlob?: ((options: EncodeOptions) => Promise<CloudUpload | null>) | undefined
  /** Confirms a successful cloud save with a ready-to-show message. */
  onCloudSaved?: ((message: string) => void) | undefined
  /** Surfaces a cloud-save failure. */
  onCloudError?: ((message: string) => void) | undefined
}

const DEFAULT_QUALITY = 0.9
const QUALITY_STEP = 0.01
const MIN_QUALITY = 0.3
const PERCENT = 100

/** UTF-8 byte length, the unit the invisible payload is measured in. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value)
}

/** Format and quality for the download. */
export function ExportPanel({
  outputSize,
  isReady,
  isExporting,
  onExport,
  onShare,
  isSharing,
  onSave,
  isSaving = false,
  organizationName,
  cloudConfig,
  onExportBlob,
  onCloudSaved,
  onCloudError,
}: ExportPanelProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [policy, setPolicy] = useState<MetadataPolicy>(DEFAULT_METADATA_POLICY)
  const [wantsInvisible, setWantsInvisible] = useState(false)
  const [message, setMessage] = useState(organizationName)
  const isLossy = format !== 'image/png'
  const isBusy = isExporting || isSharing || isSaving
  const isShareable = canShareFiles(format)
  const trimmedMessage = message.trim()
  const capacity = invisibleCapacity(outputSize.width, outputSize.height)
  const isOverCapacity = byteLength(trimmedMessage) > capacity
  // A mark is embedded only for a PNG with a message that fits; an over-long
  // message is an error that blocks export rather than a silent truncation.
  const willEmbedMark = !isLossy && wantsInvisible && trimmedMessage.length > 0 && !isOverCapacity
  const isBlocked = !isLossy && wantsInvisible && isOverCapacity
  const options = (): EncodeOptions => ({
    format,
    quality,
    metadata: effectivePolicy(policy, format),
    ...(willEmbedMark && { invisible: { message: trimmedMessage } }),
  })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id="export-format-label" className="text-sm font-medium">
          {t('editor.export.format')}
        </span>
        <Select
          aria-label={t('editor.export.format')}
          value={format}
          options={FORMAT_OPTIONS}
          onChange={(next) => {
            if (isOutputFormat(next)) {
              setFormat(next)
            }
          }}
        />
      </div>
      <SliderField
        label={t('editor.export.quality')}
        value={quality}
        min={MIN_QUALITY}
        max={1}
        step={QUALITY_STEP}
        format={(value) => `${String(Math.round(value * PERCENT))}%`}
        disabled={!isLossy}
        onChange={setQuality}
      />
      <MetadataPolicyField policy={policy} format={format} onChange={setPolicy} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={wantsInvisible}
            disabled={isLossy}
            onChange={(event) => {
              setWantsInvisible(event.currentTarget.checked)
            }}
          />
          {t('editor.export.invisibleMark')}
        </label>
        {isLossy ? <p className="text-xs text-ink-muted">{t('editor.export.choosePng')}</p> : null}
        {!isLossy && wantsInvisible ? (
          <>
            <input
              type="text"
              aria-label={t('editor.export.invisibleMessage')}
              value={message}
              maxLength={MAX_INVISIBLE_MESSAGE_LENGTH}
              onChange={(event) => {
                setMessage(event.currentTarget.value)
              }}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            />
            <p className={`text-xs ${isOverCapacity ? 'text-rose-600' : 'text-ink-muted'}`}>
              {isOverCapacity
                ? t('editor.export.tooLong', {
                    width: outputSize.width,
                    height: outputSize.height,
                    capacity,
                  })
                : t('editor.export.invisibleHint')}
            </p>
          </>
        ) : null}
      </div>
      <p className="text-xs text-ink-muted">
        {t('editor.export.renderNote', {
          width: outputSize.width,
          height: outputSize.height,
          lossless: isLossy ? '' : t('editor.export.losslessClause'),
          share: isShareable ? t('editor.export.shareClause') : '',
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          isPending={isExporting}
          disabled={!isReady || isBlocked || (isBusy && !isExporting)}
          onClick={() => {
            onExport(options())
          }}
        >
          {isExporting ? null : <Download aria-hidden="true" className="size-4" />}
          {t('editor.export.download')}
        </Button>
        {isShareable ? (
          <Button
            type="button"
            variant="secondary"
            isPending={isSharing}
            disabled={!isReady || isBlocked || (isBusy && !isSharing)}
            onClick={() => {
              onShare(options())
            }}
          >
            {isSharing ? null : <Share2 aria-hidden="true" className="size-4" />}
            {t('editor.export.share')}
          </Button>
        ) : null}
        {onSave === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            isPending={isSaving}
            disabled={!isReady || isBlocked || (isBusy && !isSaving)}
            onClick={() => {
              onSave(options())
            }}
          >
            {isSaving ? null : <Images aria-hidden="true" className="size-4" />}
            {t('editor.export.saveToGallery')}
          </Button>
        )}
        {cloudConfig === undefined || onExportBlob === undefined ? null : (
          <CloudSaveButtons
            config={cloudConfig}
            disabled={!isReady || isBlocked || isBusy}
            getUploads={async () => {
              const upload = await onExportBlob(options())
              return upload === null ? [] : [upload]
            }}
            onSaved={(provider) => {
              onCloudSaved?.(
                t('editor.export.savedToFolder', {
                  provider: PROVIDER_LABELS[provider],
                  folder: CLOUD_SAVE_FOLDER,
                }),
              )
            }}
            onError={(message) => {
              onCloudError?.(message)
            }}
          />
        )}
      </div>
    </div>
  )
}
