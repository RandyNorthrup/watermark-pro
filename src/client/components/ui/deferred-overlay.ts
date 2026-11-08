import { type FocusEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'

/** How someone first reached for an overlay whose code had not loaded yet. */
export interface OverlayOpening {
  isKeyboardOpen: boolean
}

/** Keys that open a menu button, as Radix's menu trigger handles them. */
const MENU_OPENING_KEYS = new Set(['Enter', ' ', 'ArrowDown'])

/**
 * Trigger behaviour for a closed menu or dialog whose focus, positioning and
 * dismissal code loads on first intent rather than with the page (PLAN.md
 * §5.5): hovering or focusing the trigger starts the download, and pressing it
 * mounts the real overlay already open. Menus open on press and on Enter, Space
 * or ArrowDown like Radix's menu trigger; dialogs open on click.
 */
export function useDeferredOverlay(preload: () => void, popup: 'menu' | 'dialog') {
  const [opening, setOpening] = useState<OverlayOpening | null>(null)
  const shared = {
    'aria-haspopup': popup,
    'aria-expanded': false,
    onPointerEnter: preload,
    onFocus: preload,
  } as const
  const triggerProps =
    popup === 'menu'
      ? {
          ...shared,
          onPointerDown: (event: PointerEvent) => {
            if (event.button === 0 && !event.ctrlKey) setOpening({ isKeyboardOpen: false })
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (!MENU_OPENING_KEYS.has(event.key)) return
            event.preventDefault()
            setOpening({ isKeyboardOpen: true })
          },
        }
      : {
          ...shared,
          onClick: () => {
            setOpening({ isKeyboardOpen: false })
          },
        }
  return { opening, triggerProps }
}

/**
 * The keypress that opened a deferred menu happened before the menu existed,
 * so the menu focuses its content as it would for a pointer. The returned
 * content focus handler hands that first focus to the first enabled item once;
 * later openings track keyboard use themselves.
 */
export function useFirstItemHandOff(isKeyboardOpen: boolean) {
  const pending = useRef(isKeyboardOpen)
  return (event: FocusEvent<HTMLElement>) => {
    if (!pending.current || event.target !== event.currentTarget) return
    pending.current = false
    event.currentTarget
      .querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
      ?.focus()
  }
}
