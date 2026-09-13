import type { Shape } from '../../shared/watermark'

/** Original geometric paths shared by the picker and renderer, in a 100-unit viewBox. */
export const SHAPE_VIEWBOX = 100
export const SHAPE_CATALOGUE = {
  rectangle: { label: 'designer.shape.rectangle', path: 'M5 15H95V85H5Z', aspect: 2 },
  'rounded-rectangle': {
    label: 'designer.shape.roundedRectangle',
    path: 'M20 15H80Q95 15 95 30V70Q95 85 80 85H20Q5 85 5 70V30Q5 15 20 15Z',
    aspect: 2,
  },
  ellipse: {
    label: 'designer.shape.ellipse',
    path: 'M95 50A45 35 0 1 1 5 50A45 35 0 1 1 95 50Z',
    aspect: 1,
  },
  line: { label: 'designer.shape.line', path: 'M5 50H95', aspect: 4 },
  triangle: { label: 'designer.shape.triangle', path: 'M50 0L100 100H0Z', aspect: 1 },
  diamond: { label: 'designer.shape.diamond', path: 'M50 0L100 50L50 100L0 50Z', aspect: 1 },
  pentagon: { label: 'designer.shape.pentagon', path: 'M50 0L100 38L81 100H19L0 38Z', aspect: 1 },
  hexagon: { label: 'designer.shape.hexagon', path: 'M25 0H75L100 50L75 100H25L0 50Z', aspect: 1 },
  octagon: {
    label: 'designer.shape.octagon',
    path: 'M30 0H70L100 30V70L70 100H30L0 70V30Z',
    aspect: 1,
  },
  star: {
    label: 'designer.shape.star',
    path: 'M50 0L62 35H100L69 59L81 100L50 75L19 100L31 59L0 35H38Z',
    aspect: 1,
  },
  starburst: {
    label: 'designer.shape.starburst',
    path: 'M50 0L61 20L85 15L80 39L100 50L80 61L85 85L61 80L50 100L39 80L15 85L20 61L0 50L20 39L15 15L39 20Z',
    aspect: 1,
  },
  heart: {
    label: 'designer.shape.heart',
    path: 'M50 100C35 85 0 61 0 30C0 0 35 -10 50 18C65 -10 100 0 100 30C100 61 65 85 50 100Z',
    aspect: 1,
  },
  shield: {
    label: 'designer.shape.shield',
    path: 'M50 0Q75 15 100 15V50Q100 80 50 100Q0 80 0 50V15Q25 15 50 0Z',
    aspect: 1,
  },
  'speech-bubble': {
    label: 'designer.shape.speechBubble',
    path: 'M15 0H85Q100 0 100 15V65Q100 80 85 80H40L15 100V80Q0 80 0 65V15Q0 0 15 0Z',
    aspect: 1.25,
  },
  'arrow-left': {
    label: 'designer.shape.arrowLeft',
    path: 'M0 50L40 0V30H100V70H40V100Z',
    aspect: 1.5,
  },
  'arrow-right': {
    label: 'designer.shape.arrowRight',
    path: 'M100 50L60 0V30H0V70H60V100Z',
    aspect: 1.5,
  },
  'arrow-up': { label: 'designer.shape.arrowUp', path: 'M50 0L100 40H70V100H30V40H0Z', aspect: 1 },
  'arrow-down': {
    label: 'designer.shape.arrowDown',
    path: 'M50 100L100 60H70V0H30V60H0Z',
    aspect: 1,
  },
  'double-arrow': {
    label: 'designer.shape.doubleArrow',
    path: 'M0 50L30 0V30H70V0L100 50L70 100V70H30V100Z',
    aspect: 2,
  },
  plus: {
    label: 'designer.shape.plus',
    path: 'M35 0H65V35H100V65H65V100H35V65H0V35H35Z',
    aspect: 1,
  },
} as const satisfies Record<Shape, { label: string; path: string; aspect: number }>
