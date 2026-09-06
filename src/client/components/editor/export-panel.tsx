import { Download } from 'lucide-react'
import { useState } from 'react'

import { FORMAT_OPTIONS } from './formats'
import { type EncodeOptions, OUTPUT_FORMATS, type OutputFormat } from '../../engine/encode'
import type { Size } from '../../engine/layout'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { SliderField } from '../ui/slider-field'

interface ExportPanelProps {
  outputSize: Size
  isReady: boolean
  isExporting: boolean
  onExport: (options: EncodeOptions) => void
}

const DEFAULT_QUALITY = 0.9
const QUALITY_STEP = 0.01
const MIN_QUALITY = 0.3
const PERCENT = 100

function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value)
}

/** Format and quality for the download. */
export function ExportPanel({ outputSize, isReady, isExporting, onExport }: ExportPanelProps) {
  const [format, setFormat] = useState<OutputFormat>('image/jpeg')
  const [quality, setQuality] = useState(DEFAULT_QUALITY)
  const isLossy = format !== 'image/png'
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
      <p className="text-xs text-ink-muted">
        {String(outputSize.width)} × {String(outputSize.height)} px
        {isLossy ? '' : '; PNG is lossless'}. Rendered in your browser at full resolution.
      </p>
      <Button
        type="button"
        isPending={isExporting}
        disabled={!isReady}
        className="self-start"
        onClick={() => {
          onExport({ format, quality })
        }}
      >
        {isExporting ? null : <Download aria-hidden="true" className="size-4" />}
        Download
      </Button>
    </div>
  )
}
