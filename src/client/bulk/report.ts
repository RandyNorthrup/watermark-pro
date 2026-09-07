/**
 * Builds the per-batch CSV report. Pure: one row per job with its result and
 * timing. Values that contain a comma, quote or newline are quoted and their
 * quotes doubled, so an error message with a comma cannot break the columns.
 */
import type { JobStatus } from './queue'

export interface ReportRow {
  source: string
  relativePath: string
  output: string
  status: JobStatus
  width: number | null
  height: number | null
  durationMs: number | null
  error: string | null
  presets: string
  override: boolean
}

const HEADER = [
  'source',
  'relative_path',
  'output',
  'status',
  'width',
  'height',
  'duration_ms',
  'error',
  'presets',
  'override',
] as const

const NEEDS_QUOTING = /[",\r\n]/

/** Quotes a field only when it contains a comma, quote or newline. */
function escapeCsv(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function numberField(value: number | null): string {
  return value === null ? '' : String(value)
}

/** The report as CSV text (LF line endings), header row first. */
export function buildReportCsv(rows: readonly ReportRow[]): string {
  const lines = [HEADER.join(',')]
  for (const row of rows) {
    const fields = [
      row.source,
      row.relativePath,
      row.output,
      row.status,
      numberField(row.width),
      numberField(row.height),
      numberField(row.durationMs),
      row.error ?? '',
      row.presets,
      row.override ? 'yes' : 'no',
    ]
    lines.push(fields.map((field) => escapeCsv(field)).join(','))
  }
  return lines.join('\n')
}
