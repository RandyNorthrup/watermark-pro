/**
 * Symbol catalogue (PLAN.md M3, R11): Unicode glyph groups plus a curated set
 * of lucide icons (ISC licence) flattened to single SVG path strings so the
 * engine can stroke them on a canvas.
 */
import type { IconNode } from 'lucide'
import {
  AlertTriangle,
  Anchor,
  Aperture,
  Award,
  Ban,
  Bike,
  Bird,
  Bookmark,
  Briefcase,
  Brush,
  Building2,
  Cake,
  Camera,
  Car,
  Cat,
  Check,
  CheckCircle,
  Circle,
  Clapperboard,
  Cloud,
  Coffee,
  Compass,
  Copyright,
  Cpu,
  Crown,
  Diamond,
  Dog,
  Eye,
  Feather,
  Film,
  Fingerprint,
  Fish,
  Flame,
  Flower,
  Gem,
  Gift,
  Globe,
  Heart,
  Hexagon,
  Home,
  Image,
  Info,
  Key,
  Leaf,
  Lock,
  MapPin,
  Mic,
  Moon,
  Mountain,
  Music,
  Palette,
  PenTool,
  Plane,
  Rocket,
  Scissors,
  Shield,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Star,
  Sun,
  Tag,
  Triangle,
  Umbrella,
  Waves,
  Wifi,
  Wrench,
  X,
  Zap,
} from 'lucide'

export interface GlyphGroup {
  id: string
  label: string
  glyphs: readonly string[]
  /** Emoji keep their own colours; the ink only tints their outline and shadow. */
  isEmoji?: boolean
}

/** Platform colour-emoji fonts; a comma-separated stack, drawn without ink fill. */
export const EMOJI_FONT_STACK =
  "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"

/** Glyphs are drawn with a bundled font that covers them (Noto-free fallback: system). */
export const GLYPH_GROUPS: readonly GlyphGroup[] = [
  { id: 'legal', label: 'Legal', glyphs: ['©', '®', '™', '℗', '℠', '§', '¶'] },
  { id: 'stars', label: 'Stars', glyphs: ['★', '☆', '✦', '✧', '✪', '✵', '✶', '✷', '✸', '✹'] },
  {
    id: 'arrows',
    label: 'Arrows',
    glyphs: ['→', '←', '↑', '↓', '↔', '⇒', '⇐', '➜', '➤', '➔', '↗', '↘'],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    glyphs: ['●', '○', '◉', '■', '□', '▪', '◆', '◇', '▲', '△', '▼', '▽', '◐', '◑'],
  },
  { id: 'checks', label: 'Checks and crosses', glyphs: ['✓', '✔', '✗', '✘', '☑', '☒'] },
  {
    id: 'nature',
    label: 'Nature',
    glyphs: ['☀', '☾', '☁', '❄', '⚡', '✿', '❀', '❁', '☘', '♠', '♣', '♥', '♦'],
  },
  {
    id: 'objects',
    label: 'Objects',
    glyphs: ['☕', '♪', '♫', '⚓', '⚙', '✂', '✈', '☎', '⌘', '⌚', '⌛', '✎', '✉'],
  },
  { id: 'currency', label: 'Currency', glyphs: ['$', '€', '£', '¥', '₿', '¢'] },
  {
    id: 'emoji',
    label: 'Emoji',
    isEmoji: true,
    glyphs: [
      '😀',
      '😁',
      '😂',
      '🤣',
      '😊',
      '😍',
      '😎',
      '🤩',
      '😉',
      '🙂',
      '😇',
      '🥳',
      '😢',
      '😭',
      '😡',
      '🤔',
      '😴',
      '🤗',
      '🙌',
      '👏',
      '👍',
      '👎',
      '👊',
      '✌️',
      '🤙',
      '🤝',
      '🙏',
      '💪',
      '👀',
      '🧠',
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '💯',
      '🔥',
      '✨',
      '⭐',
      '🌟',
      '💫',
      '☀️',
      '🌙',
      '☁️',
      '🌈',
      '❄️',
      '🌸',
      '🌹',
      '🌻',
      '🌴',
      '🍀',
      '🎉',
      '🎊',
      '🎈',
      '🎁',
      '🏆',
      '🥇',
      '📸',
      '🎥',
      '🎬',
      '🎨',
      '🎵',
      '🎶',
      '📷',
      '💡',
      '🔑',
      '📌',
      '📍',
      '✅',
      '❌',
      '⚠️',
      '💰',
      '💎',
      '🛒',
      '📦',
      '🍕',
      '🍔',
      '🍎',
      '🐶',
      '🐱',
      '🦊',
      '🐼',
      '🦄',
      '🚀',
      '✈️',
      '🌍',
      '🏠',
      '⏰',
      '📱',
      '💻',
      '👑',
    ],
  },
]

export interface IconEntry {
  name: string
  label: string
  node: IconNode
}

const ICONS: readonly IconEntry[] = [
  { name: 'camera', label: 'Camera', node: Camera },
  { name: 'aperture', label: 'Aperture', node: Aperture },
  { name: 'image', label: 'Image', node: Image },
  { name: 'film', label: 'Film', node: Film },
  { name: 'clapperboard', label: 'Clapperboard', node: Clapperboard },
  { name: 'sun', label: 'Sun', node: Sun },
  { name: 'moon', label: 'Moon', node: Moon },
  { name: 'cloud', label: 'Cloud', node: Cloud },
  { name: 'umbrella', label: 'Umbrella', node: Umbrella },
  { name: 'heart', label: 'Heart', node: Heart },
  { name: 'star', label: 'Star', node: Star },
  { name: 'sparkles', label: 'Sparkles', node: Sparkles },
  { name: 'zap', label: 'Lightning', node: Zap },
  { name: 'flame', label: 'Flame', node: Flame },
  { name: 'feather', label: 'Feather', node: Feather },
  { name: 'leaf', label: 'Leaf', node: Leaf },
  { name: 'flower', label: 'Flower', node: Flower },
  { name: 'mountain', label: 'Mountain', node: Mountain },
  { name: 'waves', label: 'Waves', node: Waves },
  { name: 'anchor', label: 'Anchor', node: Anchor },
  { name: 'compass', label: 'Compass', node: Compass },
  { name: 'map-pin', label: 'Map pin', node: MapPin },
  { name: 'globe', label: 'Globe', node: Globe },
  { name: 'plane', label: 'Plane', node: Plane },
  { name: 'rocket', label: 'Rocket', node: Rocket },
  { name: 'shield', label: 'Shield', node: Shield },
  { name: 'shield-check', label: 'Shield check', node: ShieldCheck },
  { name: 'lock', label: 'Lock', node: Lock },
  { name: 'key', label: 'Key', node: Key },
  { name: 'fingerprint', label: 'Fingerprint', node: Fingerprint },
  { name: 'eye', label: 'Eye', node: Eye },
  { name: 'copyright', label: 'Copyright', node: Copyright },
  { name: 'award', label: 'Award', node: Award },
  { name: 'crown', label: 'Crown', node: Crown },
  { name: 'diamond', label: 'Diamond', node: Diamond },
  { name: 'gem', label: 'Gem', node: Gem },
  { name: 'hexagon', label: 'Hexagon', node: Hexagon },
  { name: 'circle', label: 'Circle', node: Circle },
  { name: 'square', label: 'Square', node: Square },
  { name: 'triangle', label: 'Triangle', node: Triangle },
  { name: 'bookmark', label: 'Bookmark', node: Bookmark },
  { name: 'tag', label: 'Tag', node: Tag },
  { name: 'check', label: 'Check', node: Check },
  { name: 'check-circle', label: 'Check circle', node: CheckCircle },
  { name: 'x', label: 'Cross', node: X },
  { name: 'ban', label: 'Ban', node: Ban },
  { name: 'info', label: 'Info', node: Info },
  { name: 'alert-triangle', label: 'Warning', node: AlertTriangle },
  { name: 'music', label: 'Music', node: Music },
  { name: 'mic', label: 'Microphone', node: Mic },
  { name: 'palette', label: 'Palette', node: Palette },
  { name: 'brush', label: 'Brush', node: Brush },
  { name: 'pen-tool', label: 'Pen tool', node: PenTool },
  { name: 'scissors', label: 'Scissors', node: Scissors },
  { name: 'coffee', label: 'Coffee', node: Coffee },
  { name: 'cake', label: 'Cake', node: Cake },
  { name: 'gift', label: 'Gift', node: Gift },
  { name: 'dog', label: 'Dog', node: Dog },
  { name: 'cat', label: 'Cat', node: Cat },
  { name: 'bird', label: 'Bird', node: Bird },
  { name: 'fish', label: 'Fish', node: Fish },
  { name: 'bike', label: 'Bike', node: Bike },
  { name: 'car', label: 'Car', node: Car },
  { name: 'home', label: 'Home', node: Home },
  { name: 'building', label: 'Building', node: Building2 },
  { name: 'briefcase', label: 'Briefcase', node: Briefcase },
  { name: 'wrench', label: 'Wrench', node: Wrench },
  { name: 'cpu', label: 'Chip', node: Cpu },
  { name: 'wifi', label: 'Wi-Fi', node: Wifi },
  { name: 'smile', label: 'Smile', node: Smile },
]

export const ICON_CATALOGUE: readonly IconEntry[] = ICONS

/** Attribute bag of a lucide element; values arrive as strings. */
type Attributes = Record<string, string | number | undefined>

function num(attributes: Attributes, key: string): number {
  const value = Number(attributes[key] ?? 0)
  if (!Number.isFinite(value)) {
    throw new TypeError(`icon attribute ${key} is not a number`)
  }
  return value
}

/** Two half-circle arcs approximate a full ellipse in path syntax. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const diameter = 2 * rx
  return `M${String(cx - rx)} ${String(cy)}a${String(rx)} ${String(ry)} 0 1 0 ${String(diameter)} 0a${String(rx)} ${String(ry)} 0 1 0 ${String(-diameter)} 0`
}

function elementToPath(tag: string, attrs: Attributes): string {
  switch (tag) {
    case 'path': {
      return String(attrs['d'] ?? '')
    }
    case 'circle': {
      const r = num(attrs, 'r')
      return ellipsePath(num(attrs, 'cx'), num(attrs, 'cy'), r, r)
    }
    case 'ellipse': {
      return ellipsePath(num(attrs, 'cx'), num(attrs, 'cy'), num(attrs, 'rx'), num(attrs, 'ry'))
    }
    case 'rect': {
      const x = num(attrs, 'x')
      const y = num(attrs, 'y')
      const width = num(attrs, 'width')
      const height = num(attrs, 'height')
      return `M${String(x)} ${String(y)}h${String(width)}v${String(height)}h${String(-width)}Z`
    }
    case 'line': {
      return `M${String(num(attrs, 'x1'))} ${String(num(attrs, 'y1'))}L${String(num(attrs, 'x2'))} ${String(num(attrs, 'y2'))}`
    }
    case 'polyline':
    case 'polygon': {
      const points = String(attrs['points'] ?? '')
        .trim()
        .split(/\s+/)
      return `M${points.join('L')}${tag === 'polygon' ? 'Z' : ''}`
    }
    default: {
      throw new TypeError(`unsupported icon element: ${tag}`)
    }
  }
}

/**
 * Flattens a lucide icon node into one path string. Rounded rectangle
 * corners are dropped, which at watermark sizes is invisible.
 */
export function iconToPath(node: IconNode): string {
  return node.map(([tag, attributes]) => elementToPath(tag, attributes)).join(' ')
}

export function findIcon(name: string): IconEntry | undefined {
  return ICON_CATALOGUE.find((icon) => icon.name === name)
}

/** Path data for a catalogue icon; throws for unknown names. */
export function iconPath(name: string): string {
  const icon = findIcon(name)
  if (icon === undefined) {
    throw new Error(`unknown icon: ${name}`)
  }
  return iconToPath(icon.node)
}
