import { Link2Off, Scissors, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MAX_VIDEO_SECONDS, VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import { clipEnd, type ClipEdit, type ProjectClip } from '../../../shared/video-project'
import type { ProjectMediaAsset } from '../../video/project-media'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'

/** Source bounds are visible and editable; validation rejects overlap and linked-pair drift. */
export function ProjectInspector({
  clip,
  asset,
  time,
  onEdit,
  onSplit,
  onRemove,
  onUnlink,
}: {
  clip: ProjectClip | undefined
  asset: ProjectMediaAsset | undefined
  time: number
  onEdit: (edit: ClipEdit) => void
  onSplit: () => void
  onRemove: () => void
  onUnlink: () => void
}) {
  const { t } = useTranslation()
  if (clip === undefined || asset === undefined)
    return <p className="py-6 text-sm text-ink-muted">{t('video.studio.selectClip')}</p>
  const fields: { key: keyof ClipEdit; label: string; value: number; max: number; min: number }[] =
    [
      {
        key: 'start',
        label: t('video.timeline.start'),
        value: clip.start,
        min: 0,
        max: MAX_VIDEO_SECONDS - (clip.out - clip.in),
      },
      {
        key: 'in',
        label: t('video.studio.sourceIn'),
        value: clip.in,
        min: 0,
        max: clip.out - VIDEO_PROJECT_LIMITS.timeStep,
      },
      {
        key: 'out',
        label: t('video.studio.sourceOut'),
        value: clip.out,
        min: clip.in + VIDEO_PROJECT_LIMITS.timeStep,
        max: asset.probe.durationSeconds,
      },
    ]
  const timingFieldCount = fields.length
  if (clip.kind === 'audio')
    fields.push({ key: 'gain', label: t('video.studio.volume'), value: clip.gain, min: 0, max: 1 })
  else
    fields.push(
      { key: 'x', label: 'X', value: clip.x, min: 0, max: 1 },
      { key: 'y', label: 'Y', value: clip.y, min: 0, max: 1 },
      {
        key: 'scale',
        label: t('designer.style.size'),
        value: clip.scale,
        min: VIDEO_PROJECT_LIMITS.minimumScale,
        max: VIDEO_PROJECT_LIMITS.maximumScale,
      },
      { key: 'opacity', label: t('designer.style.opacity'), value: clip.opacity, min: 0, max: 1 },
    )
  const count =
    clip.kind === 'video' ? VIDEO_PROJECT_LIMITS.videoTracks : VIDEO_PROJECT_LIMITS.audioTracks
  return (
    <div className="studio-clip-inspector">
      <p className="studio-clip-name" title={asset.file.name}>
        {asset.file.name}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        {t('video.studio.track')}
        <Select
          aria-label={t('video.studio.track')}
          value={String(clip.track)}
          options={Array.from({ length: count }, (_, track) => ({
            value: String(track),
            label: `${clip.kind === 'video' ? 'V' : 'A'}${String(track + 1)}`,
          }))}
          onChange={(value) => onEdit({ track: Number(value) })}
        />
      </label>
      {[
        { label: t('video.studio.timing'), fields: fields.slice(0, timingFieldCount) },
        {
          label: t(clip.kind === 'video' ? 'video.studio.transform' : 'video.studio.volume'),
          fields: fields.slice(timingFieldCount),
        },
      ].map((group) => (
        <fieldset key={group.label} className="studio-inspector-group">
          <legend>{group.label}</legend>
          <div className="grid grid-cols-2 gap-2">
            {group.fields.map((field) => (
              <label key={field.key} className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                {field.label}
                <Input
                  type="number"
                  aria-label={field.label}
                  min={field.min}
                  max={field.max}
                  step={VIDEO_PROJECT_LIMITS.timeStep}
                  value={field.value}
                  onChange={(event) => onEdit({ [field.key]: event.currentTarget.valueAsNumber })}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="studio-clip-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={time <= clip.start || time >= clipEnd(clip)}
          onClick={onSplit}
        >
          <Scissors className="size-4" aria-hidden="true" />
          {t('video.studio.split')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
          {t('video.studio.removeClip')}
        </Button>
        {clip.kind === 'audio' && clip.linkedVideoId !== null ? (
          <Button type="button" variant="secondary" size="sm" onClick={onUnlink}>
            <Link2Off className="size-4" aria-hidden="true" />
            {t('video.studio.unlink')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
