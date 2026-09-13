import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { GuidanceItem } from './guidance-queue'
import { Button } from '../ui/button'

const TOPIC_COPY = {
  image: {
    title: 'guidance.image.title',
    first: 'guidance.image.first',
    second: 'guidance.image.second',
  },
  watermark: {
    title: 'guidance.watermark.title',
    first: 'guidance.watermark.first',
    second: 'guidance.watermark.second',
  },
  presets: {
    title: 'guidance.presets.title',
    first: 'guidance.presets.first',
    second: 'guidance.presets.second',
  },
  crop: {
    title: 'guidance.crop.title',
    first: 'guidance.crop.first',
    second: 'guidance.crop.second',
  },
  adjust: {
    title: 'guidance.adjust.title',
    first: 'guidance.adjust.first',
    second: 'guidance.adjust.second',
  },
  resize: {
    title: 'guidance.resize.title',
    first: 'guidance.resize.first',
    second: 'guidance.resize.second',
  },
  export: {
    title: 'guidance.export.title',
    first: 'guidance.export.first',
    second: 'guidance.export.second',
  },
  library: {
    title: 'guidance.library.title',
    first: 'guidance.library.first',
    second: 'guidance.library.second',
  },
  gallery: {
    title: 'guidance.gallery.title',
    first: 'guidance.gallery.first',
    second: 'guidance.gallery.second',
  },
  bulk: {
    title: 'guidance.bulk.title',
    first: 'guidance.bulk.first',
    second: 'guidance.bulk.second',
  },
  documents: {
    title: 'guidance.documents.title',
    first: 'guidance.documents.first',
    second: 'guidance.documents.second',
  },
  video: {
    title: 'guidance.video.title',
    first: 'guidance.video.first',
    second: 'guidance.video.second',
  },
  workspace: {
    title: 'guidance.workspace.title',
    first: 'guidance.workspace.first',
    second: 'guidance.workspace.second',
  },
} as const

const SWIPE_DISTANCE_PX = 40
const GUIDE_PAGE_COUNT = 2
interface GuidanceCardProps {
  item: GuidanceItem
  onDismiss: () => void
}

/** Compact, nonmodal help leaves the tool usable and never captures a canvas gesture. */
export function GuidanceCard({ item, onDismiss }: GuidanceCardProps) {
  const { t } = useTranslation()
  const copy = TOPIC_COPY[item.topic]
  const titleId = useId()
  const descriptionId = useId()
  const focusRestoreRef = useRef(false)
  const [page, setPage] = useState(0)
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null)
  const anchorRef = useRef({
    contextElement: item.anchor ?? undefined,
    getBoundingClientRect: () =>
      item.anchor?.isConnected === true
        ? item.anchor.getBoundingClientRect()
        : new DOMRect(document.documentElement.clientWidth, 0, 0, 0),
  })
  const hasNext = page < GUIDE_PAGE_COUNT - 1
  return (
    <Popover.Root
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) onDismiss()
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        <Popover.Content
          data-first-use-tip=""
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="glass-popover z-40 flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] touch-pan-y flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised p-4 text-ink shadow-card outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const anchor = item.anchor
            const active = document.activeElement
            if (
              focusRestoreRef.current &&
              anchor?.isConnected === true &&
              anchor.getClientRects().length > 0 &&
              (active === document.body ||
                (active instanceof Element && active.closest('[data-first-use-tip]') !== null))
            )
              anchor.focus({ preventScroll: true })
          }}
          onEscapeKeyDown={() => {
            focusRestoreRef.current = true
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (
              event.pointerType !== 'touch' ||
              (event.target instanceof Element && event.target.closest('button') !== null)
            )
              return
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          }}
          onPointerUp={(event) => {
            const start = gesture.current
            gesture.current = null
            if (start?.id !== event.pointerId) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) <= Math.abs(dy)) return
            setPage((current) =>
              Math.max(0, Math.min(GUIDE_PAGE_COUNT - 1, current + (dx < 0 ? 1 : -1))),
            )
          }}
          onPointerCancel={() => {
            gesture.current = null
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-2">
            <h2 id={titleId} className="text-sm font-semibold">
              {t(copy.title)}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="-me-1 -mt-1 size-7 shrink-0"
              aria-label={t('guidance.dismiss')}
              onClick={(event) => {
                focusRestoreRef.current = event.detail === 0
                onDismiss()
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div
            className="min-h-0 touch-pan-y overflow-y-auto overscroll-contain"
            aria-live="polite"
            aria-atomic="true"
          >
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-ink-muted">
              {t(page === 0 ? copy.first : copy.second)}
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              {t('guidance.page', { current: page + 1, total: GUIDE_PAGE_COUNT })}
            </p>
          </div>
          <div className="mt-3 flex shrink-0 justify-between gap-2">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(0)}>
              <ChevronLeft className="size-4" />
              {t('guidance.back')}
            </Button>
            <Button
              size="sm"
              onClick={(event) => {
                if (hasNext) setPage(page + 1)
                else {
                  focusRestoreRef.current = event.detail === 0
                  onDismiss()
                }
              }}
            >
              {t(hasNext ? 'guidance.next' : 'guidance.done')}
              {hasNext ? <ChevronRight className="size-4" /> : null}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
