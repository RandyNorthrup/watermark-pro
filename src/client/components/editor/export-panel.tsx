import { Download, Images, Share2 } from 'lucide-react'
import { useState } from 'react'

import { FORMAT_OPTIONS } from './formats'
import { MetadataPolicyField } from './metadata-policy'
import {
  DEFAULT_METADATA_POLICY,
  effectivePolicy,
  type EncodeOptions,
  type MetadataPolicy,
  OUTPUT_FORMATS,
  type OutputFormat,
} from '../../engine/encode'
import type { Size } from '../../engine/layout'
import { canShareFiles } from '../../lib/share-file'
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
}

const DEFAULT_QUALITY = 0.9
const QUALITY_STEP = 0.01
const MIN_QUALITY = 0.3
const PERCENT = 100

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
}: ExportPanelProps) {
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const [policy, setPolicy] = useState<MetadataPolicy>(DEFAULT_METADATA_POLICY)
  const isLossy = format !== 'image/png'
  const isBusy = isExporting || isSharing || isSaving
  const isShareable = canShareFiles(format)
  const options = (): EncodeOptions => ({
    format,
    quality,
    metadata: effectivePolicy(policy, format),
  })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id="export-format-label" className="text-sm font-medium">
          Format
        </span>
        <Select
          aria-label="Format"
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
        label="Quality"
        value={quality}
        min={MIN_QUALITY}
        max={1}
        step={QUALITY_STEP}
        format={(value) => `${String(Math.round(value * PERCENT))}%`}
        disabled={!isLossy}
        onChange={setQuality}
      />
      <MetadataPolicyField policy={policy} format={format} onChange={setPolicy} />
      <p className="text-xs text-ink-muted">
        {String(outputSize.width)} × {String(outputSize.height)} px
        {isLossy ? '' : '; PNG is lossless'}. Rendered in your browser at full resolution
        {isShareable ? '; Share sends it to Photos, Messages or any app on this device' : ''}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          isPending={isExporting}
          disabled={!isReady || (isBusy && !isExporting)}
          onClick={() => {
            onExport(options())
          }}
        >
          {isExporting ? null : <Download aria-hidden="true" className="size-4" />}
          Download
        </Button>
        {isShareable ? (
          <Button
            type="button"
            variant="secondary"
            isPending={isSharing}
            disabled={!isReady || (isBusy && !isSharing)}
            onClick={() => {
              onShare(options())
            }}
          >
            {isSharing ? null : <Share2 aria-hidden="true" className="size-4" />}
            Share
          </Button>
        ) : null}
        {onSave === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            isPending={isSaving}
            disabled={!isReady || (isBusy && !isSaving)}
            onClick={() => {
              onSave(options())
            }}
          >
            {isSaving ? null : <Images aria-hidden="true" className="size-4" />}
            Save to gallery
          </Button>
        )}
      </div>
    </div>
  )
}
