import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { WatermarkDto } from '../../../shared/api'
import { describeError } from '../../lib/errors'
import { Alert } from '../ui/alert'
import { Spinner } from '../ui/spinner'

interface PresetGateProps {
  query: UseQueryResult<WatermarkDto[]>
  /** Completes the sentence "Create a preset in the library …". */
  emptyHint: string
  children: (presets: WatermarkDto[]) => ReactNode
}

/**
 * Loading, error and empty states for tools that need at least one library
 * preset; renders the children with the loaded list otherwise.
 */
export function PresetGate({ query, emptyHint, children }: PresetGateProps) {
  if (query.isPending) {
    return <Spinner className="size-5" label="Loading presets" />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title="Could not load presets">
        {describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.length === 0) {
    return (
      <Alert tone="info" title="No presets yet">
        <Link to="/app/library/new" className="font-medium underline">
          Create a preset in the library
        </Link>{' '}
        {emptyHint}
      </Alert>
    )
  }
  return children(query.data)
}
