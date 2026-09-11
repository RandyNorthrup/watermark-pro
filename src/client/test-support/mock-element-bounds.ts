import { vi } from 'vitest'

const TEST_WIDTH = 480
const TEST_HEIGHT = 320

/** Give layout-sensitive components stable dimensions in jsdom. */
export function mockElementBounds() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: TEST_WIDTH,
    bottom: TEST_HEIGHT,
    width: TEST_WIDTH,
    height: TEST_HEIGHT,
    toJSON: () => ({}),
  })
}
