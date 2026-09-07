/**
 * Tabular audit trail shared by the organization audit page and the platform
 * admin console. The first three columns are the same everywhere; the last
 * one is whatever the caller wants to show for an entry.
 */
import type { ReactNode } from 'react'
import type { z } from 'zod'

import type { auditEntrySchema } from '../../shared/api'
import { dateTimeFormatter } from '../lib/format-date'
import { Card } from './ui/card'

export type AuditEntry = z.infer<typeof auditEntrySchema>

interface AuditTableProps {
  caption: string
  entries: AuditEntry[]
  detailHeading: string
  renderDetail: (entry: AuditEntry) => ReactNode
}

export function AuditTable({ caption, entries, detailHeading, renderDetail }: AuditTableProps) {
  return (
    <Card
      className="overflow-x-auto p-0 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      // Wide tables scroll sideways on phones; a scroll region must be reachable from the keyboard.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-3 md:px-4">
              When
            </th>
            <th scope="col" className="px-3 py-3 md:px-4">
              Who
            </th>
            <th scope="col" className="px-3 py-3 md:px-4">
              Action
            </th>
            <th scope="col" className="px-3 py-3 md:px-4">
              {detailHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-line">
              <td className="px-3 py-3 whitespace-nowrap md:px-4">
                <time dateTime={entry.createdAt}>
                  {dateTimeFormatter.format(new Date(entry.createdAt))}
                </time>
              </td>
              <td className="px-3 py-3 md:px-4">{entry.actorName ?? 'System'}</td>
              <td className="px-3 py-3 font-mono text-xs md:px-4">{entry.action}</td>
              {renderDetail(entry)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
