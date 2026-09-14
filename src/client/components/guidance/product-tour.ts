import { captureOfflineGeneration, currentOfflineUser } from '../../lib/offline-context'

const PRODUCT_TOUR_EVENT = 'lumafoil:product-tour'
const replay: {
  pending:
    | ({ userId: string; workspaceId: string | null } & ReturnType<typeof captureOfflineGeneration>)
    | null
} = { pending: null }

/** Replay is a deliberate account-settings action, never a reset of the saved invitation. */
export function requestProductTour(userId: string, workspaceId: string | null): void {
  if (currentOfflineUser() !== userId) return
  // Account Settings can render before the lazy tour bundle. Retain that explicit
  // click until its account's controller subscribes; an event alone would lose it.
  replay.pending = { userId, workspaceId, ...captureOfflineGeneration() }
  window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_EVENT, { detail: userId }))
}

/** Only the mounted account may accept a replay request. */
export function subscribeProductTour(
  userId: string,
  workspaceId: string | null,
  onStart: () => void,
): () => void {
  let isSubscribed = true
  const deliver = () => {
    const request = replay.pending
    if (!isSubscribed || request?.userId !== userId) return
    replay.pending = null
    if (request.workspaceId !== workspaceId) return
    try {
      request.assertCurrent()
    } catch {
      // A click from a signed-out or replaced account must never navigate its successor.
      return
    }
    if (currentOfflineUser() === userId) onStart()
  }
  const listener = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      event.detail === userId &&
      replay.pending?.workspaceId === workspaceId
    )
      deliver()
  }
  window.addEventListener(PRODUCT_TOUR_EVENT, listener)
  // Defer delivery past React Strict Mode's setup/cleanup rehearsal.
  queueMicrotask(deliver)
  return () => {
    isSubscribed = false
    window.removeEventListener(PRODUCT_TOUR_EVENT, listener)
  }
}

/** Navigation and tool selection only: the tour never creates or changes user content. */
export const PRODUCT_TOUR_STEPS = [
  { route: '/app/editor', title: 'tour.images.title', body: 'tour.images.body', tool: null },
  {
    route: '/app/editor',
    title: 'tour.watermark.title',
    body: 'tour.watermark.body',
    tool: 'watermark',
  },
  { route: '/app/editor', title: 'tour.presets.title', body: 'tour.presets.body', tool: 'presets' },
  { route: '/app/editor', title: 'tour.saved.title', body: 'tour.saved.body', tool: 'saved' },
  {
    route: '/app/editor',
    title: 'tour.transform.title',
    body: 'tour.transform.body',
    tool: 'crop',
  },
  { route: '/app/editor', title: 'tour.export.title', body: 'tour.export.body', tool: 'export' },
  {
    route: '/app/documents',
    title: 'tour.documents.title',
    body: 'tour.documents.body',
    tool: null,
  },
  { route: '/app/video', title: 'tour.videos.title', body: 'tour.videos.body', tool: null },
  { route: '/app/bulk', title: 'tour.bulk.title', body: 'tour.bulk.body', tool: null },
  { route: '/app/library', title: 'tour.library.title', body: 'tour.library.body', tool: null },
  { route: '/app/gallery', title: 'tour.gallery.title', body: 'tour.gallery.body', tool: null },
  { route: '/app/account', title: 'tour.account.title', body: 'tour.account.body', tool: null },
  { route: '/app/account', title: 'tour.workspace.title', body: 'tour.workspace.body', tool: null },
] as const
