import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CropOverlay, type CropGesture } from './crop-overlay'
import { MarkOverlay, type MarkGesture } from './mark-overlay'

const previewSize = { width: 1000, height: 500 }
/** Displayed at half size so every conversion is exercised. */
const displaySize = { width: 500, height: 250 }
const placement = {
  centreX: 800,
  centreY: 400,
  anchor: null,
  width: 200,
  height: 100,
  rotation: 0,
}

function pointer(type: string, target: Element, x: number, y: number, pointerId = 1) {
  fireEvent(
    target,
    new PointerEvent(type, { clientX: x, clientY: y, pointerId, bubbles: true, cancelable: true }),
  )
}

beforeEach(() => {
  // jsdom has no layout: the overlay root sits at the viewport origin.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 500,
    bottom: 250,
    width: 500,
    height: 250,
    toJSON: () => ({}),
  })
})

function renderOverlay(onGesture: (gesture: MarkGesture) => void, rotation = 0, scale = 0.2) {
  render(
    <MarkOverlay
      placement={{ ...placement, rotation }}
      previewSize={previewSize}
      displaySize={displaySize}
      scale={scale}
      rotation={rotation}
      onGesture={onGesture}
    />,
  )
}

describe('MarkOverlay', () => {
  it('positions the frame from the placement at display scale', () => {
    renderOverlay(vi.fn())
    const frame = screen.getByRole('group', { name: /Watermark position/ })
    expect(frame).toHaveStyle({ left: '350px', top: '175px', width: '100px', height: '50px' })
  })

  it('drags to move and reports the centre as fractions', () => {
    const gestures: MarkGesture[] = []
    renderOverlay((gesture) => {
      gestures.push(gesture)
    })
    const frame = screen.getByRole('group', { name: /Watermark position/ })
    pointer('pointerdown', frame, 400, 200)
    pointer('pointermove', frame, 300, 150)
    pointer('pointermove', frame, 900, 150, 2)
    pointer('pointerup', frame, 300, 150)
    expect(gestures.map((gesture) => gesture.phase)).toEqual(['start', 'move', 'end'])
    expect(gestures[1]?.patch.x).toBeCloseTo((400 - 100) / 500)
    expect(gestures[1]?.patch.y).toBeCloseTo((200 - 50) / 250)
  })

  it('scales from the corner handle and rotates from the top handle', () => {
    const gestures: MarkGesture[] = []
    renderOverlay(
      (gesture) => {
        gestures.push(gesture)
      },
      10,
      0.2,
    )
    const resize = screen.getByRole('button', { name: 'Resize watermark' })
    // Centre is at (400, 200) on screen; start 100px away, end 150px away.
    pointer('pointerdown', resize, 500, 200)
    pointer('pointermove', resize, 550, 200)
    pointer('pointerup', resize, 550, 200)
    expect(gestures[1]?.patch.scale).toBeCloseTo(0.3)

    const rotate = screen.getByRole('button', { name: 'Rotate watermark' })
    pointer('pointerdown', rotate, 400, 100)
    // A quarter turn clockwise on screen is -90° of counter-clockwise rotation.
    pointer('pointermove', rotate, 500, 200)
    pointer('pointerup', rotate, 500, 200)
    expect(gestures.at(-2)?.patch.rotation).toBeCloseTo(10 - 90)
  })

  it('nudges, resizes and rotates from the keyboard as discrete commits', () => {
    const gestures: MarkGesture[] = []
    renderOverlay(
      (gesture) => {
        gestures.push(gesture)
      },
      0,
      0.2,
    )
    const frame = screen.getByRole('group', { name: /Watermark position/ })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    fireEvent.keyDown(frame, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(frame, { key: '+' })
    fireEvent.keyDown(frame, { key: '-' })
    fireEvent.keyDown(frame, { key: ']' })
    fireEvent.keyDown(frame, { key: 'a' })
    expect(gestures).toHaveLength(5)
    expect(gestures.every((gesture) => gesture.phase === 'commit')).toBe(true)
    expect(gestures[0]?.patch.x).toBeCloseTo(0.79)
    expect(gestures[0]?.patch.y).toBeCloseTo(0.8)
    expect(gestures[1]?.patch.x).toBeCloseTo(0.8)
    expect(gestures[1]?.patch.y).toBeCloseTo(0.85)
    expect(gestures[2]?.patch.scale).toBeCloseTo(0.21)
    expect(gestures[3]?.patch.scale).toBeCloseTo(0.2 / 1.05)
    expect(gestures[4]?.patch.rotation).toBe(5)
  })

  it('renders nothing until the image has a size', () => {
    const { container } = render(
      <MarkOverlay
        placement={placement}
        previewSize={previewSize}
        displaySize={{ width: 0, height: 0 }}
        scale={0.2}
        rotation={0}
        onGesture={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CropOverlay', () => {
  const source = { width: 2000, height: 1000 }
  const crop = { x: 400, y: 200, width: 800, height: 400 }

  function renderCrop(onGesture: (gesture: CropGesture) => void, ratio: number | null = null) {
    render(
      <CropOverlay
        crop={crop}
        source={source}
        displaySize={displaySize}
        ratio={ratio}
        onGesture={onGesture}
      />,
    )
  }

  it('draws the frame at display scale and moves it in source pixels', () => {
    const gestures: CropGesture[] = []
    renderCrop((gesture) => {
      gestures.push(gesture)
    })
    const frame = screen.getByRole('group', { name: /Crop area/ })
    expect(frame).toHaveStyle({ left: '100px', top: '50px', width: '200px', height: '100px' })
    pointer('pointerdown', frame, 150, 75)
    pointer('pointermove', frame, 175, 60)
    pointer('pointerup', frame, 175, 60)
    expect(gestures.map((gesture) => gesture.phase)).toEqual(['start', 'move', 'end'])
    // 25 display px = 100 source px; -15 display px = -60 source px.
    expect(gestures[1]?.crop).toEqual({ x: 500, y: 140, width: 800, height: 400 })
  })

  it('resizes from a handle, keeping a locked ratio', () => {
    const gestures: CropGesture[] = []
    renderCrop((gesture) => {
      gestures.push(gesture)
    }, 2)
    const handle = screen.getByRole('button', { name: 'Resize crop from the bottom right corner' })
    pointer('pointerdown', handle, 300, 150)
    pointer('pointermove', handle, 350, 150)
    pointer('pointerup', handle, 350, 150)
    const resized = gestures[1]?.crop
    expect(resized).toEqual({ x: 400, y: 200, width: 1000, height: 500 })
  })

  it('nudges with the arrow keys', () => {
    const gestures: CropGesture[] = []
    renderCrop((gesture) => {
      gestures.push(gesture)
    })
    const frame = screen.getByRole('group', { name: /Crop area/ })
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    fireEvent.keyDown(frame, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(frame, { key: 'Enter' })
    expect(gestures).toHaveLength(2)
    expect(gestures[0]).toEqual({
      phase: 'commit',
      crop: { x: 420, y: 200, width: 800, height: 400 },
    })
    expect(gestures[1]?.crop).toEqual({ x: 400, y: 150, width: 800, height: 400 })
  })
})
