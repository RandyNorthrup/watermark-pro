const INITIALS_MAX = 2

/** Up to two uppercase initials from a display name, e.g. "Ada Lovelace" → "AL". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, INITIALS_MAX)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
