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
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              When
            </th>
            <th scope="col" className="px-4 py-3">
              Who
            </th>
            <th scope="col" className="px-4 py-3">
              Action
            </th>
            <th scope="col" className="px-4 py-3">
              {detailHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-line">
              <td className="px-4 py-3 whitespace-nowrap">
                <time dateTime={entry.createdAt}>
                  {dateTimeFormatter.format(new Date(entry.createdAt))}
                </time>
              </td>
              <td className="px-4 py-3">{entry.actorName ?? 'System'}</td>
              <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
              {renderDetail(entry)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
