import { useEffect, useState } from 'react'

import type { Size } from '../engine/layout'

/**
 * Rendered size of an element, kept current through ResizeObserver. Takes
 * the element itself (from a callback ref) rather than a ref object so the
 * measurement starts as soon as the element mounts.
 */
const EMPTY_SIZE: Size = { width: 0, height: 0 }

export function useElementSize(element: HTMLElement | null): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => {
    if (element === null) {
      return
    }
    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    }
    // ResizeObserver fires once on observe, which delivers the initial size
    // without a synchronous setState in the effect body.
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [element])
  return element === null ? EMPTY_SIZE : size
}
