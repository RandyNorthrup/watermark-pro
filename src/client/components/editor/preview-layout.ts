/**
 * The editor's preview area. Shared with the route's loading view, which shows
 * the editor's own first frame (the sample scene) while the editor's code loads.
 */
export const PREVIEW_REGION_CLASS =
  'app-scroll-region relative h-[50svh] min-h-64 touch-none overflow-auto rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] lg:h-[calc(100svh-18rem)] lg:min-h-96'

export const PREVIEW_GRID_CLASS = 'grid h-max min-h-full w-max min-w-full place-items-center p-3'

export const SAMPLE_PREVIEW_CLASS = 'max-h-[42svh] lg:max-h-[70vh] lg:max-w-none'
