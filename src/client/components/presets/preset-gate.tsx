import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { WatermarkDto } from '../../../shared/api-watermark'
import { describeError } from '../../lib/errors'
import { Alert } from '../ui/alert'
import { Spinner } from '../ui/spinner'

interface PresetGateProps {
  query: UseQueryResult<WatermarkDto[]>
  /** Completes the sentence "Create a preset in the library …". */
  emptyHint: string
  emptyContent?: ReactNode
  children: (presets: WatermarkDto[]) => ReactNode
}

/**
 * Loading, error and empty states for tools that need at least one library
 * preset; renders the children with the loaded list otherwise.
 */
export function PresetGate({ query, emptyHint, emptyContent, children }: PresetGateProps) {
  const { t } = useTranslation()
  if (query.isPending) {
    return <Spinner className="size-5" label={t('presets.loading')} />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title={t('presets.loadErrorTitle')}>
        {describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.length === 0) {
    if (emptyContent !== undefined) return emptyContent
    return (
      <Alert tone="info" title={t('presets.emptyTitle')}>
        <Link to="/app/library/new" className="font-medium underline">
          {t('presets.createInLibrary')}
        </Link>{' '}
        {emptyHint}
      </Alert>
    )
  }
  return children(query.data)
}
