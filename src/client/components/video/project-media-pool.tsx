import { Film, Music2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { VIDEO_PROJECT_LIMITS } from '../../../shared/constants'
import type { ProjectMediaAsset } from '../../video/project-media'
import { videoTimeLabel } from '../../video/time'
import { Button } from '../ui/button'

/** Imported files stay available for reuse and undo; thumbnails come from decoded source pixels. */
export function ProjectMediaPool({
  assets,
  onAdd,
}: {
  assets: readonly ProjectMediaAsset[]
  onAdd: (asset: ProjectMediaAsset, track: number) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="studio-media" aria-label={t('video.studio.mediaPool')}>
      <h2 className="studio-panel-title">
        <Film className="size-4" aria-hidden="true" />
        {t('video.studio.mediaPool')}
        <span className="ms-auto text-ink-muted tabular-nums">{assets.length}</span>
      </h2>
      <div className="app-scroll-region flex flex-col gap-3 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t('video.studio.emptyMedia')}</p>
        ) : (
          assets.map((asset) => (
            <article key={asset.id} className="studio-media-card">
              <div className="studio-media-poster" data-kind={asset.kind}>
                {asset.kind === 'video' ? (
                  <img src={asset.poster} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Music2 className="size-8" aria-hidden="true" />
                )}
                <span className="absolute end-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs">
                  {videoTimeLabel(asset.probe.durationSeconds)}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                <p className="truncate text-xs font-medium" title={asset.file.name}>
                  {asset.file.name}
                </p>
                <div className="flex gap-1">
                  {(asset.kind === 'video'
                    ? [0, 1]
                    : [VIDEO_PROJECT_LIMITS.videoTracks, VIDEO_PROJECT_LIMITS.audioTracks - 1]
                  ).map((track) => (
                    <Button
                      key={track}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-w-0 flex-1"
                      aria-label={t('video.studio.addClip', {
                        name: asset.file.name,
                        track: `${asset.kind === 'video' ? 'V' : 'A'}${String(track + 1)}`,
                      })}
                      onClick={() => onAdd(asset, track)}
                    >
                      <Plus className="size-3" aria-hidden="true" />
                      {asset.kind === 'video' ? 'V' : 'A'}
                      {track + 1}
                    </Button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <p className="border-t border-line p-3 text-xs text-ink-muted">
        {t('video.studio.localSession')}
      </p>
    </section>
  )
}
