/**
 * Synthetic landscape used as the default preview subject in the designer:
 * a sky gradient, a sun, layered hills and a bright foreground. It gives the
 * smart placement and contrast heuristics both busy and calm regions to
 * choose between without shipping a photograph.
 */
export const SAMPLE_PHOTO_WIDTH = 960
export const SAMPLE_PHOTO_HEIGHT = 640

const SKY_TOP = '#0f3b6f'
const SKY_BOTTOM = '#8ec5ff'
const SUN = '#ffe9a8'
const HILL_COLOURS = ['#1f5f4a', '#2d7d5f', '#4aa676'] as const
const GROUND = '#f2e8c9'
const SUN_X = 0.72
const SUN_Y = 0.28
const SUN_RADIUS = 0.09
const HORIZON = 0.62
const HILL_STEP = 0.07
const HILL_WAVES = 3
const HILL_AMPLITUDE = 0.05
const GROUND_START = 0.84
/** Quarter turn between hill layers so their ridges interleave. */
const HILL_PHASE_STEP = Math.PI / 2
const HILL_STEPS = 64

function drawHill(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  phase: number,
  colour: string,
): void {
  const path = new Path2D()
  path.moveTo(0, height)
  for (let step = 0; step <= HILL_STEPS; step += 1) {
    const x = (step / HILL_STEPS) * width
    const wave = Math.sin((step / HILL_STEPS) * Math.PI * HILL_WAVES + phase)
    path.lineTo(x, (baseline + wave * HILL_AMPLITUDE) * height)
  }
  path.lineTo(width, height)
  path.closePath()
  ctx.fillStyle = colour
  ctx.fill(path)
}

/** Draws the sample scene; exported so the browser tests can check its content. */
export function drawSamplePhoto(canvas: OffscreenCanvas): void {
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('2D canvas context is unavailable')
  }
  const { width, height } = canvas
  const sky = ctx.createLinearGradient(0, 0, 0, height * HORIZON)
  sky.addColorStop(0, SKY_TOP)
  sky.addColorStop(1, SKY_BOTTOM)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = SUN
  ctx.beginPath()
  ctx.arc(width * SUN_X, height * SUN_Y, Math.min(width, height) * SUN_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  for (const [index, colour] of HILL_COLOURS.entries()) {
    drawHill(ctx, width, height, HORIZON + index * HILL_STEP, index * HILL_PHASE_STEP, colour)
  }

  ctx.fillStyle = GROUND
  ctx.fillRect(0, height * GROUND_START, width, height * (1 - GROUND_START))
}

export async function createSamplePhoto(): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(SAMPLE_PHOTO_WIDTH, SAMPLE_PHOTO_HEIGHT)
  drawSamplePhoto(canvas)
  return await createImageBitmap(canvas)
}
