import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PRODUCT_TOUR_STEPS } from './product-tour'
import { Button } from '../ui/button'

const SWIPE_DISTANCE_PX = 40
const VIEWPORT_INSET_PX = 12

interface GuidanceCardProps {
  step: number | null
  isMoving: boolean
  hasError: boolean
  onStart: () => void
  onBack: () => void
  onNext: () => void
  onExit: () => void
}

/** The optional tour stays compact, exits at any point, and never captures canvas gestures. */
export function GuidanceCard({
  step,
  isMoving,
  hasError,
  onStart,
  onBack,
  onNext,
  onExit,
}: GuidanceCardProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null)
  const anchorRef = useRef({
    getBoundingClientRect: () => {
      const viewport = window.visualViewport
      return new DOMRect(
        document.documentElement.clientWidth / 2,
        viewport?.height ?? window.innerHeight,
        0,
        0,
      )
    },
  })
  const item = step === null ? undefined : PRODUCT_TOUR_STEPS[step]
  const isInvitation = item === undefined
  const isLast = step === PRODUCT_TOUR_STEPS.length - 1
  const next = () => {
    if (isMoving) return
    if (isLast) onExit()
    else onNext()
  }
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onExit()
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          data-first-use-tip=""
          data-product-tour={isInvitation ? 'invitation' : 'step'}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          side="top"
          align="center"
          sideOffset={VIEWPORT_INSET_PX}
          collisionPadding={VIEWPORT_INSET_PX}
          className="glass-popover tour-card z-40 flex max-h-[calc(100dvh-1.5rem)] w-88 max-w-[calc(100vw-1.5rem)] touch-pan-y flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised p-4 text-ink shadow-card outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (!isInvitation) contentRef.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (isInvitation || isMoving || event.target !== event.currentTarget) return
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              next()
            }
            if (step !== 0 && event.key === 'ArrowLeft') {
              event.preventDefault()
              onBack()
            }
          }}
          onPointerDown={(event) => {
            if (
              isInvitation ||
              isMoving ||
              event.pointerType !== 'touch' ||
              (event.target instanceof Element && event.target.closest('button') !== null)
            )
              return
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          }}
          onPointerUp={(event) => {
            const start = gesture.current
            gesture.current = null
            if (isMoving || start?.id !== event.pointerId) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) <= Math.abs(dy)) return
            if (dx < 0) next()
            else if (step !== 0) onBack()
          }}
          onPointerCancel={() => {
            gesture.current = null
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-2">
            <h2 id={titleId} className="text-base font-semibold">
              {t(item?.title ?? 'tour.invitationTitle')}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="-me-1 -mt-1 size-8 shrink-0"
              aria-label={t('tour.close')}
              onClick={onExit}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div
            className="min-h-0 touch-pan-y overflow-y-auto"
            aria-live="polite"
            aria-atomic="true"
          >
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-ink">
              {t(item?.body ?? 'tour.invitationBody')}
            </p>
            {hasError ? (
              <p role="alert" className="mt-2 text-sm text-ink">
                {t('tour.navigationError')}
              </p>
            ) : null}
            {step === null ? null : (
              <p className="mt-3 text-xs text-ink-muted">
                {t('tour.progress', { current: step + 1, total: PRODUCT_TOUR_STEPS.length })}
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-2">
            {isInvitation ? (
              <>
                <Button size="sm" variant="secondary" onClick={onExit}>
                  {t('tour.decline')}
                </Button>
                <Button size="sm" onClick={onStart}>
                  {t('tour.start')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={onExit}>
                  {t('tour.exit')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={step === 0 || isMoving}
                  onClick={onBack}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  {t('tour.back')}
                </Button>
                <Button size="sm" isPending={isMoving} onClick={next}>
                  {t(isLast ? 'tour.finish' : 'tour.next')}
                  {isLast ? null : <ChevronRight aria-hidden="true" className="size-4" />}
                </Button>
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
