import type { AnyRoute } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { preloadImage, preloadRouteImages } from './preload'

function preloadsIn(head: HTMLHeadElement): { href: string; priority: string }[] {
  return [...head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].map(
    (link) => ({
      href: link.getAttribute('href') ?? '',
      priority: link.getAttribute('fetchpriority') ?? '',
    }),
  )
}

function routeWith(preloadImages?: readonly string[]): AnyRoute {
  return { options: { staticData: preloadImages === undefined ? {} : { preloadImages } } } as never
}

describe('preloadImage', () => {
  it('adds one high-priority link per URL, however often it is asked', () => {
    const head = document.createElement('head')
    preloadImage('/scene.jpg', head)
    preloadImage('/scene.jpg', head)
    preloadImage('/other "quoted".png', head)
    expect(preloadsIn(head)).toEqual([
      { href: '/scene.jpg', priority: 'high' },
      { href: '/other "quoted".png', priority: 'high' },
    ])
  })
})

describe('preloadRouteImages', () => {
  it('follows every matched route’s declaration and ignores routes without one', () => {
    const head = document.createElement('head')
    preloadRouteImages(
      [routeWith(), routeWith(['/scene.jpg']), routeWith(['/scene.jpg', '/logo.png'])],
      head,
    )
    expect(preloadsIn(head).map((link) => link.href)).toEqual(['/scene.jpg', '/logo.png'])
  })
})
