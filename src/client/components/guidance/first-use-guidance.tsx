import { useEffect, useState, useSyncExternalStore } from 'react'

import { GuidanceCard } from './guidance-card'
import { GuidanceQueue } from './guidance-queue'
import {
  guidanceClaimResponseSchema,
  guidanceTopicSchema,
  type GuidanceTopic,
} from '../../../shared/guidance'
import { fetchJson } from '../../lib/api'
import { captureOfflineGeneration, currentOfflineUser } from '../../lib/offline-context'

const ROUTE_TOPICS: Partial<Record<string, GuidanceTopic>> = {
  '/app/editor': 'image',
  '/app/library': 'library',
  '/app/gallery': 'gallery',
  '/app/bulk': 'bulk',
  '/app/documents': 'documents',
  '/app/video': 'video',
}
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

/** Mount exactly once, keyed by authenticated user ID; never reuse this queue across accounts. */
export function FirstUseGuidance({ pathname, userId }: { pathname: string; userId: string }) {
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
  useEffect(() => {
    const current = queue
    current.activate()
    const syncBlocking = () => current.setBlocked(hasConflictingSurface())
    const syncConnection = () => current.setOnline(navigator.onLine)
    const observer = new MutationObserver(syncBlocking)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'aria-hidden'],
    })
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLElement>('[data-guidance-topic]')
      const topic = guidanceTopicSchema.safeParse(anchor?.dataset['guidanceTopic'])
      if (topic.success) current.enqueue(topic.data, anchor)
    }
    document.addEventListener('click', onClick)
    window.addEventListener('online', syncConnection)
    window.addEventListener('offline', syncConnection)
    syncBlocking()
    syncConnection()
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick)
      window.removeEventListener('online', syncConnection)
      window.removeEventListener('offline', syncConnection)
      current.dispose()
    }
  }, [queue])
  useEffect(() => {
    queue.setContext(pathname)
    const topic = ROUTE_TOPICS[pathname]
    if (topic !== undefined)
      queue.enqueue(
        topic,
        [...document.querySelectorAll<HTMLElement>(`nav a[href="${CSS.escape(pathname)}"]`)].find(
          (anchor) => anchor.getClientRects().length > 0,
        ) ?? null,
      )
  }, [pathname, queue])
  return <GuidanceDisplay queue={queue} />
}

function GuidanceDisplay({ queue }: { queue: GuidanceQueue }) {
  const { active, isBlocked } = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  return active === null || isBlocked ? null : (
    <GuidanceCard key={active.topic} item={active} onDismiss={() => queue.dismiss()} />
  )
}
