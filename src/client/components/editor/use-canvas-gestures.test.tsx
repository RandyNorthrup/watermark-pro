import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { useCanvasGestures } from './use-canvas-gestures'

function View({ changed }: { changed: (zoom: number) => void }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(100)
  const gestures = useCanvasGestures(viewport, zoom, (next) => {
    changed(next)
    setZoom(next)
  })
  return (
    <div ref={setViewport} data-testid="viewport" data-zoom={zoom} {...gestures}>
      <img src="/fixture.png" alt="Fixture" />
    </div>
  )
}

function pointer(
  type: string,
  element: HTMLElement,
  id: number,
  x: number,
  y: number,
  pointerType = 'touch',
) {
  fireEvent(
    element,
    new PointerEvent(type, {
      pointerId: id,
      clientX: x,
      clientY: y,
      pointerType,
      bubbles: true,
      cancelable: true,
    }),
  )
}

afterEach(() => vi.restoreAllMocks())

it('pinches around the fingers, continues with a swipe, and ignores unowned pointers', async () => {
  const changed = vi.fn()
  render(<View changed={changed} />)
  const viewport = screen.getByTestId('viewport')
  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: -viewport.scrollLeft,
    y: -viewport.scrollTop,
    left: -viewport.scrollLeft,
    top: -viewport.scrollTop,
    right: 400 - viewport.scrollLeft,
    bottom: 300 - viewport.scrollTop,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  }))
  pointer('pointerdown', viewport, 1, 50, 100)
  pointer('pointerdown', viewport, 2, 150, 100)
  pointer('pointerdown', viewport, 3, 500, 500)
  pointer('pointermove', viewport, 3, 1000, 1000)
  expect(changed).not.toHaveBeenCalled()
  pointer('pointermove', viewport, 2, 250, 100)
  await waitFor(() => expect(viewport).toHaveAttribute('data-zoom', '200'))
  expect(viewport.scrollLeft).toBe(50)
  pointer('pointerup', viewport, 2, 250, 100)
  pointer('pointermove', viewport, 1, 30, 80)
  expect(viewport.scrollLeft).toBe(70)
  expect(viewport.scrollTop).toBe(120)
  pointer('pointerup', viewport, 1, 30, 80)
  pointer('pointermove', viewport, 1, 0, 0)
  expect(viewport.scrollLeft).toBe(70)
  pointer('pointerdown', viewport, 4, 100, 100, 'mouse')
  pointer('pointermove', viewport, 4, 0, 0, 'mouse')
  expect(viewport.scrollLeft).toBe(70)
})

it('clamps zoom and stops tracking cancelled touch gestures', async () => {
  const changed = vi.fn()
  render(<View changed={changed} />)
  const viewport = screen.getByTestId('viewport')
  pointer('pointerdown', viewport, 1, 0, 0)
  pointer('pointerdown', viewport, 2, 100, 0)
  pointer('pointermove', viewport, 2, 1000, 0)
  await waitFor(() => expect(viewport).toHaveAttribute('data-zoom', '400'))
  pointer('pointermove', viewport, 2, 1, 0)
  pointer('pointercancel', viewport, 2, 1, 0)
  await waitFor(() => expect(viewport).toHaveAttribute('data-zoom', '1'))
  const calls = changed.mock.calls.length
  pointer('pointermove', viewport, 1, 900, 900)
  pointer('pointerup', viewport, 1, 900, 900)
  expect(changed).toHaveBeenCalledTimes(calls)
})
