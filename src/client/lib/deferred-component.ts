import { type ComponentType, lazy } from 'react'

/**
 * A lazily loaded component with a preload that starts its download early;
 * both share the browser's single module fetch. Closed overlays and the
 * heavy page tools load this way so a page paints before their code arrives
 * (PLAN.md §5.5).
 */
export function deferredComponent<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  return {
    preload: (): void => {
      void load()
    },
    Component: lazy(async () => ({ default: await load() })),
  }
}
