import { RotateCcw } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useState } from 'react'

import {
  type Adjustments,
  type FilterId,
  FILTER_BY_ID,
  FILTERS,
  filterFor,
  IDENTITY_ADJUSTMENTS,
} from '../../../shared/adjustments'
import { mainThreadBackend } from '../../lib/canvas-backend'
import { renderFilterThumbnails } from '../../lib/filter-thumbnails'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'

interface AdjustPanelProps {
  adjust: Adjustments
  onChange: (adjust: Adjustments) => void
  /** The photo the thumbnails preview; `null` uses the sample scene. */
  photoFile: File | null
}

type Channel = keyof Adjustments

interface ChannelConfig {
  key: Channel
  label: string
  min: number
}

const CHANNELS: readonly ChannelConfig[] = [
  { key: 'brightness', label: 'Brightness', min: -1 },
  { key: 'contrast', label: 'Contrast', min: -1 },
  { key: 'saturation', label: 'Saturation', min: -1 },
  { key: 'warmth', label: 'Warmth', min: -1 },
  { key: 'sepia', label: 'Sepia', min: 0 },
  { key: 'vignette', label: 'Vignette', min: 0 },
]

const PERCENT = 100
const SLIDER_STEP = 0.01

function percent(value: number): string {
  const rounded = Math.round(value * PERCENT)
  return `${rounded > 0 ? '+' : ''}${String(rounded)}%`
}

/** Colour-adjustment sliders and the named-filter strip for the editor's Adjust tab. */
export function AdjustPanel({ adjust, onChange, photoFile }: AdjustPanelProps) {
  const [thumbnails, setThumbnails] = useState<Map<FilterId, string>>(new Map())
  const activeFilter = filterFor(adjust)

  useEffect(() => {
    let isCancelled = false
    let created = new Map<FilterId, string>()
    async function build() {
      try {
        const bitmap = photoFile === null ? null : await createImageBitmap(photoFile)
        const next = await renderFilterThumbnails(bitmap, mainThreadBackend())
        if (isCancelled) {
          for (const url of next.values()) {
            URL.revokeObjectURL(url)
          }
          return
        }
        created = next
        setThumbnails(next)
      } catch {
        // No canvas (jsdom) or an undecodable file: fall back to labels only.
      }
    }
    void build()
    return () => {
      isCancelled = true
      for (const url of created.values()) {
        URL.revokeObjectURL(url)
      }
    }
  }, [photoFile])

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup.Root
        aria-label="Filter"
        value={activeFilter}
        onValueChange={(value) => {
          const match = FILTERS.find((filter) => filter.id === value)
          if (match !== undefined) {
            onChange(match.adjust)
          }
        }}
        className="grid grid-cols-4 gap-1.5"
      >
        {FILTERS.map((filter) => {
          const thumbnail = thumbnails.get(filter.id)
          return (
            <RadioGroup.Item
              key={filter.id}
              value={filter.id}
              className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-raised p-1.5 text-xs font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=checked]:border-brand-500 data-[state=checked]:text-ink"
            >
              <span className="block aspect-square w-full overflow-hidden rounded bg-line/40">
                {thumbnail === undefined ? null : (
                  <img
                    src={thumbnail}
                    alt=""
                    className="size-full object-cover"
                    width={96}
                    height={96}
                  />
                )}
              </span>
              {filter.label}
            </RadioGroup.Item>
          )
        })}
      </RadioGroup.Root>
      <p className="text-xs text-ink-muted" aria-live="polite">
        {activeFilter === 'custom'
          ? 'Custom adjustments'
          : `Filter: ${FILTER_BY_ID[activeFilter].label}`}
      </p>
      <div className="flex flex-col gap-3">
        {CHANNELS.map(({ key, label, min }) => (
          <div key={key} className="flex items-end gap-2">
            <SliderField
              className="flex-1"
              label={label}
              value={adjust[key]}
              min={min}
              max={1}
              step={SLIDER_STEP}
              format={percent}
              onChange={(value) => {
                onChange({ ...adjust, [key]: value })
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Reset ${label}`}
              disabled={adjust[key] === IDENTITY_ADJUSTMENTS[key]}
              onClick={() => {
                onChange({ ...adjust, [key]: IDENTITY_ADJUSTMENTS[key] })
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={activeFilter === 'original'}
        onClick={() => {
          onChange(IDENTITY_ADJUSTMENTS)
        }}
      >
        Reset all
      </Button>
    </div>
  )
}
