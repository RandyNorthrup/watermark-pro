/**
 * Boot-time resource hints. A route that paints an image first (the sample
 * scene in the editor and designer) lists it in `staticData.preloadImages`;
 * `main.tsx` asks for those images for the current URL as soon as the router
 * exists, so they arrive alongside the session and organization fetches
 * instead of after them. On a phone that chain is most of the gap between
 * the first paint and the largest one.
 */
import type { AnyRoute } from '@tanstack/react-router'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Images the route paints first; requested at boot for the matched URL. */
    preloadImages?: readonly string[]
  }
}

/** Adds a high-priority image preload once; repeated calls for the same URL are no-ops. */
export function preloadImage(href: string, head: HTMLHeadElement = document.head): void {
  const selector = `link[rel="preload"][as="image"][href="${CSS.escape(href)}"]`
  if (head.querySelector(selector) !== null) {
    return
  }
  const link = document.createElement('link')
  link.setAttribute('rel', 'preload')
  link.setAttribute('as', 'image')
  link.setAttribute('href', href)
  link.setAttribute('fetchpriority', 'high')
  head.append(link)
}

/** Preloads every image the given routes declare, in order. */
export function preloadRouteImages(
  routes: readonly AnyRoute[],
  head: HTMLHeadElement = document.head,
): void {
  for (const route of routes) {
    const images = route.options.staticData?.preloadImages ?? []
    for (const href of images) {
      preloadImage(href, head)
    }
  }
}
