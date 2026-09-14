import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { GuidanceCard } from './guidance-card'
import { GuidanceQueue } from './guidance-queue'
import { PRODUCT_TOUR_STEPS, subscribeProductTour } from './product-tour'
import { guidanceClaimResponseSchema } from '../../../shared/guidance'
import { fetchJson } from '../../lib/api'
import { captureOfflineGeneration, currentOfflineUser } from '../../lib/offline-context'

const CONFLICTING_SURFACES =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

function hasConflictingSurface(): boolean {
  return [...document.querySelectorAll<HTMLElement>(CONFLICTING_SURFACES)].some((surface) => {
    if (
      surface.closest('[data-first-use-tip]') !== null ||
      surface.hidden !== false ||
      surface.dataset['state'] === 'closed'
    )
      return false
    const style = getComputedStyle(surface)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

interface FirstUseGuidanceProps {
  pathname: string
  userId: string
  workspaceId: string | null
}

/** One invitation per account. No feature guidance or navigation occurs before explicit opt-in. */
export function FirstUseGuidance({ pathname, userId, workspaceId }: FirstUseGuidanceProps) {
  // Remounting cancels pending claims/navigation and prevents an old workspace's tour resurfacing.
  return (
    <AccountProductTour
      key={`${userId}:${workspaceId ?? ''}`}
      pathname={pathname}
      userId={userId}
      workspaceId={workspaceId}
    />
  )
}

function AccountProductTour({ pathname, userId, workspaceId }: FirstUseGuidanceProps) {
  const navigate = useNavigate()
  const [queue] = useState(() => {
    const generation = captureOfflineGeneration()
    return new GuidanceQueue(async (topic) => {
      generation.assertCurrent()
      if (currentOfflineUser() !== userId) throw new Error('Guidance account changed.')
      const result = await fetchJson('/api/me/guidance/claim', guidanceClaimResponseSchema, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic }),
      })
      generation.assertCurrent()
      return result.claimed
    })
  })
  const { active, isBlocked } = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  const [step, setStep] = useState<number | null>(null)
  const [isMoving, setMoving] = useState(false)
  const [hasError, setError] = useState(false)
  const epoch = useRef(0)
  const exit = useCallback(() => {
    epoch.current += 1
    queue.dismiss()
    setStep(null)
    setMoving(false)
    setError(false)
  }, [queue])
  const go = useCallback(
    async (index: number) => {
      const next = PRODUCT_TOUR_STEPS[index]
      if (next === undefined || currentOfflineUser() !== userId) return
      const generation = captureOfflineGeneration()
      const request = ++epoch.current
      setMoving(true)
      setError(false)
      try {
        if (pathname !== next.route) await navigate({ to: next.route })
        generation.assertCurrent()
        if (request !== epoch.current) return
        setStep(index)
      } catch {
        if (request === epoch.current && currentOfflineUser() === userId) setError(true)
      } finally {
        if (request === epoch.current) setMoving(false)
      }
    },
    [navigate, pathname, userId],
  )
  const start = useCallback(() => {
    queue.dismiss()
    setStep(0)
    void go(0)
  }, [go, queue])

  useEffect(() => {
    queue.activate()
    const syncBlocking = () => queue.setBlocked(hasConflictingSurface())
    const syncConnection = () => queue.setOnline(navigator.onLine)
    const observer = new MutationObserver(syncBlocking)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'aria-hidden'],
    })
    window.addEventListener('online', syncConnection)
    window.addEventListener('offline', syncConnection)
    syncBlocking()
    syncConnection()
    queue.enqueue('tour')
    return () => {
      epoch.current += 1
      observer.disconnect()
      window.removeEventListener('online', syncConnection)
      window.removeEventListener('offline', syncConnection)
      queue.dispose()
    }
  }, [queue])
  useEffect(() => subscribeProductTour(userId, workspaceId, start), [start, userId, workspaceId])
  useEffect(() => {
    const current = step === null ? undefined : PRODUCT_TOUR_STEPS[step]
    if (isBlocked || current?.route !== pathname || current.tool === null) return
    const target = document.querySelector<HTMLElement>(
      `[data-guidance-topic="${CSS.escape(current.tool)}"]`,
    )
    // The allowlisted anchors are tabs or the Image export-panel opener, never save/upload actions.
    if (
      target?.getAttribute('role') === 'tab' ||
      (current.tool === 'export' && target instanceof HTMLButtonElement)
    )
      target.click()
  }, [step, pathname, isBlocked])

  if (
    isBlocked ||
    (active === null && step === null && !isMoving) ||
    currentOfflineUser() !== userId
  )
    return null
  return (
    <GuidanceCard
      key={step ?? 'invitation'}
      step={step}
      isMoving={isMoving}
      hasError={hasError}
      onStart={start}
      onBack={() => {
        if (step !== null) void go(step - 1)
      }}
      onNext={() => {
        if (step !== null) void go(step + 1)
      }}
      onExit={exit}
    />
  )
}
