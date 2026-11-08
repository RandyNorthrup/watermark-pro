import { Suspense } from 'react'

import { type GooeyDestination, GooeyTrigger } from './shell-triggers'
import { deferredComponent, useDeferredOverlay } from './ui/deferred-overlay'

const { Component: GooeyPanel, preload: preloadPanel } = deferredComponent(async () => {
  const { GooeyPanel: panel } = await import('./gooey-panel')
  return panel
})

/**
 * The half-circle handle opens separate labelled pills in a rounded arc. The
 * arc and its popover code load when someone first reaches for the handle.
 */
export function GooeyNavigation({
  items,
  label,
}: {
  items: readonly GooeyDestination[]
  label: string
}) {
  const { opening, triggerProps } = useDeferredOverlay(preloadPanel, 'dialog')
  return (
    <aside className="gooey-navigation hidden md:block" data-workspace-navigation>
      {opening === null ? (
        <GooeyTrigger isOpen={false} {...triggerProps} />
      ) : (
        <Suspense
          fallback={
            <GooeyTrigger isOpen={false} aria-haspopup="dialog" aria-expanded={false} aria-busy />
          }
        >
          <GooeyPanel items={items} label={label} />
        </Suspense>
      )}
    </aside>
  )
}
