import type { HealthResponse } from '../../shared/api'

interface HealthBadgeProps {
  health: HealthResponse
}

/** Shows the API status and which environment answered. */
export function HealthBadge({ health }: HealthBadgeProps) {
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-4 py-2 text-sm shadow-card"
    >
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-emerald-500" />
      <span>
        API {health.status} · <span className="font-mono">{health.environment}</span>
      </span>
    </p>
  )
}
