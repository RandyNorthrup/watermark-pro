/**
 * Camera-capture support detection for the import UI. A coarse pointer (finger
 * or stylus) is the signal browsers expose for a touch device, where the file
 * input's `capture` attribute opens the OS camera instead of a file picker.
 */

/** Media query whose match indicates a touch-first device with a usable camera. */
const COARSE_POINTER_QUERY = '(pointer: coarse)'

/**
 * Whether this device should be offered the "take a photo" flow. Pure and
 * jsdom-testable: when `matchMedia` is absent (as in jsdom) it returns `false`
 * rather than throwing, so callers can render the capture button conditionally.
 */
export function isCaptureSupported(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}
