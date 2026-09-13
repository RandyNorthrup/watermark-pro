import { KeyRound, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { keyframeTime, VIDEO_MOTION_LIMITS, type VideoMotion } from '../../video/motion'
import { videoTimeLabel } from '../../video/time'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'

const TIME_STEP = 0.01

/** Selected-layer timing, fades and timestamp poses, all stored in the editor history. */
export function VideoTimeline({
  motion,
  duration,
  time,
  onChange,
  onKeyframe,
  onSeek,
}: {
  motion: VideoMotion
  duration: number
  time: number
  onChange: (motion: VideoMotion) => void
  onKeyframe: () => void
  onSeek: (time: number) => void
}) {
  const { t } = useTranslation()
  const span = motion.end - motion.start
  function interval(start: number, end: number) {
    const fadeIn = Math.min(motion.fadeIn, end - start)
    const fadeOut = Math.min(motion.fadeOut, end - start - fadeIn)
    onChange({ ...motion, start, end, fadeIn, fadeOut })
  }
  const point = keyframeTime(time)
  const hasCurrent = motion.keyframes.some((frame) => frame.time === point)
  return (
    <section className="tool-section flex flex-col gap-3" aria-label={t('video.timeline.heading')}>
      <h2 className="text-sm font-semibold">{t('video.timeline.heading')}</h2>
      <SliderField
        label={t('video.timeline.start')}
        value={motion.start}
        min={0}
        max={Math.max(0, motion.end - TIME_STEP)}
        step={TIME_STEP}
        format={videoTimeLabel}
        resetValue={0}
        resetLabel={t('editor.adjust.reset', { name: t('video.timeline.start') })}
        onChange={(value) => interval(value, motion.end)}
      />
      <SliderField
        label={t('video.timeline.end')}
        value={motion.end}
        min={Math.min(duration, motion.start + TIME_STEP)}
        max={duration}
        step={TIME_STEP}
        format={videoTimeLabel}
        resetValue={duration}
        resetLabel={t('editor.adjust.reset', { name: t('video.timeline.end') })}
        onChange={(value) => interval(motion.start, value)}
      />
      <SliderField
        label={t('video.timeline.fadeIn')}
        value={motion.fadeIn}
        min={0}
        max={span - motion.fadeOut}
        step={TIME_STEP}
        format={videoTimeLabel}
        resetValue={0}
        resetLabel={t('editor.adjust.reset', { name: t('video.timeline.fadeIn') })}
        onChange={(value) => onChange({ ...motion, fadeIn: value })}
      />
      <SliderField
        label={t('video.timeline.fadeOut')}
        value={motion.fadeOut}
        min={0}
        max={span - motion.fadeIn}
        step={TIME_STEP}
        format={videoTimeLabel}
        resetValue={0}
        resetLabel={t('editor.adjust.reset', { name: t('video.timeline.fadeOut') })}
        onChange={(value) => onChange({ ...motion, fadeOut: value })}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={!hasCurrent && motion.keyframes.length >= VIDEO_MOTION_LIMITS.keyframes}
        onClick={onKeyframe}
      >
        <KeyRound aria-hidden="true" className="size-4" />
        {t(hasCurrent ? 'video.timeline.updateKeyframe' : 'video.timeline.addKeyframe')}
      </Button>
      <p className="text-xs text-ink-muted">{t('video.timeline.hint')}</p>
      {motion.keyframes.length === 0 ? null : (
        <ul
          className="app-scroll-region max-h-40 overflow-y-auto rounded-xl border border-line"
          aria-label={t('video.timeline.keyframes')}
        >
          {motion.keyframes.map((frame) => (
            <li
              key={frame.time}
              className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 last:border-b-0"
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={frame.time === point}
                onClick={() => onSeek(frame.time)}
              >
                {videoTimeLabel(frame.time)}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('video.timeline.removeKeyframe', {
                  time: videoTimeLabel(frame.time),
                })}
                onClick={() =>
                  onChange({
                    ...motion,
                    keyframes: motion.keyframes.filter((entry) => entry.time !== frame.time),
                  })
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
