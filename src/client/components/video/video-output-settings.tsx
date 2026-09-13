import { useTranslation } from 'react-i18next'

import type { VideoQuality, VideoResolution } from '../../video/plan'
import { Select } from '../ui/select'

export interface VideoOutputChoice {
  quality: VideoQuality
  resolution: VideoResolution
}

const QUALITY_OPTIONS = [
  { value: 'low', labelKey: 'video.qualityOptions.low' },
  { value: 'standard', labelKey: 'video.qualityOptions.standard' },
  { value: 'high', labelKey: 'video.qualityOptions.high' },
] as const
const RESOLUTION_OPTIONS = [
  { value: 'original', labelKey: 'video.resolutionOptions.original' },
  { value: '1080p', labelKey: 'video.resolutionOptions.fit1080p' },
  { value: '720p', labelKey: 'video.resolutionOptions.fit720p' },
] as const

/** Video and mixed Bulk share identical output choices and accessible labels. */
export function VideoOutputSettings({
  value,
  onChange,
  disabled = false,
}: {
  value: VideoOutputChoice
  onChange: (choice: VideoOutputChoice) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('video.quality')}
        <Select
          aria-label={t('video.quality')}
          value={value.quality}
          disabled={disabled}
          options={QUALITY_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          onChange={(selected) => {
            const option = QUALITY_OPTIONS.find((item) => item.value === selected)
            if (option !== undefined) onChange({ ...value, quality: option.value })
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('video.resolution')}
        <Select
          aria-label={t('video.resolution')}
          value={value.resolution}
          disabled={disabled}
          options={RESOLUTION_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          onChange={(selected) => {
            const option = RESOLUTION_OPTIONS.find((item) => item.value === selected)
            if (option !== undefined) onChange({ ...value, resolution: option.value })
          }}
        />
      </label>
    </div>
  )
}
