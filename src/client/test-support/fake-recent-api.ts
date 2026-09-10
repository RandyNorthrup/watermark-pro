import type { FakeLibraryState } from './fake-library-api'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  DEFAULT_RECENT_VIEW,
  RECENT_WORK_LIMIT,
  recentActivitySchema,
  recentViewRequestSchema,
  type RecentActivity,
  type RecentView,
  type RecentWorkItem,
} from '../../shared/recent-work'

export interface FakeRecentState {
  activity: Map<string, RecentActivity[]>
  views: Map<string, RecentView>
}
export function emptyRecentState(): FakeRecentState {
  return { activity: new Map(), views: new Map() }
}

/** Account-bound UI fixture; the real server authorization is tested separately with Better Auth. */
export function handleRecent(
  state: FakeLibraryState,
  url: string,
  init: RequestInit,
): Response | null {
  const pathname = new URL(url, 'http://localhost').pathname
  const match = /^\/api\/orgs\/([^/]+)\/recent-work$/.exec(pathname)
  if (match === null && pathname !== '/api/me/recent-view') return null
  const userId = new Headers(init.headers).get(ACCOUNT_ID_HEADER)
  if (userId === null) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const method = init.method ?? 'GET'
  if (pathname === '/api/me/recent-view') {
    if (method === 'PATCH') {
      const body = recentViewRequestSchema.parse(
        JSON.parse(typeof init.body === 'string' ? init.body : '{}'),
      )
      state.recents.views.set(userId, body.view)
    }
    return Response.json({ view: state.recents.views.get(userId) ?? DEFAULT_RECENT_VIEW })
  }
  const organizationId = match?.[1] ?? ''
  const key = JSON.stringify([userId, organizationId])
  if (method === 'POST') {
    const activity = recentActivitySchema.parse(
      JSON.parse(typeof init.body === 'string' ? init.body : '{}'),
    )
    const list = state.recents.activity.get(key) ?? []
    const existing = list.find(
      (item) => item.kind === activity.kind && item.resourceId === activity.resourceId,
    )
    if (existing === undefined) list.push(activity)
    else if (existing.usedAt < activity.usedAt) existing.usedAt = activity.usedAt
    state.recents.activity.set(key, list)
    return new Response(null, { status: 204 })
  }
  const items: RecentWorkItem[] = []
  const history = state.recents.activity.get(key) ?? []
  for (const activity of history) {
    if (activity.kind === 'photo') {
      const photo = state.gallery.photos.find(
        (item) => item.id === activity.resourceId && item.organizationId === organizationId,
      )
      if (photo !== undefined) items.push({ kind: 'photo', usedAt: activity.usedAt, photo })
    } else {
      const preset = state.watermarks.find(
        (item) => item.id === activity.resourceId && item.organizationId === organizationId,
      )
      if (preset !== undefined) items.push({ kind: 'preset', usedAt: activity.usedAt, preset })
    }
  }
  return Response.json({
    items: items.toSorted((a, b) => b.usedAt.localeCompare(a.usedAt)).slice(0, RECENT_WORK_LIMIT),
  })
}
