import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Field } from './ui/field'
import { Input } from './ui/input'
import { referralLinkSchema } from '../../shared/api-accounts'
import { fetchJson, sendNoContent } from '../lib/api'
import { describeError } from '../lib/errors'

/** A reusable invitation reports counts only; referred accounts remain private. */
export function ReferralInvitation({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const queryKey = ['referral-link', userId]
  const link = useQuery({
    queryKey,
    queryFn: () => fetchJson('/api/me/referral-link', referralLinkSchema, { method: 'POST' }),
  })
  const [copyError, setCopyError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const hasLink = link.data?.url != null
  const change = useMutation({
    mutationFn: async (action: 'rotate' | 'revoke') => {
      if (action === 'rotate')
        await fetchJson('/api/me/referral-link/rotate', referralLinkSchema, { method: 'POST' })
      else await sendNoContent('/api/me/referral-link', { method: 'DELETE' })
    },
    onSuccess: async () => {
      setIsCopied(false)
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  async function copy() {
    const url = link.data?.url
    if (url == null) return
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(url)
      setIsCopied(true)
    } catch {
      setCopyError(t('referral.copyError'))
    }
  }
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <LinkIcon aria-hidden="true" className="size-5" />
        {t('referral.heading')}
      </h2>
      <p className="text-sm text-ink-muted">{t('referral.description')}</p>
      {link.isPending ? <p role="status">{t('siteInvites.loading')}</p> : null}
      {link.isError ? <Alert tone="error">{describeError(link.error)}</Alert> : null}
      {change.isError ? <Alert tone="error">{describeError(change.error)}</Alert> : null}
      {copyError === null ? null : <Alert tone="error">{copyError}</Alert>}
      {link.data === undefined ? null : (
        <p>{t('referral.count', { count: link.data.acceptedAccounts })}</p>
      )}
      <Field label={t('referral.url')}>
        {(control) => (
          <Input
            {...control}
            value={link.data?.url ?? ''}
            placeholder={link.data?.url === null ? t('referral.revoked') : undefined}
            disabled={!hasLink}
            readOnly
            onFocus={(event) => {
              event.target.select()
            }}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!hasLink} onClick={() => void copy()}>
          <Copy aria-hidden="true" className="size-4" />
          {t(isCopied ? 'referral.copied' : 'referral.copy')}
        </Button>
        <Button
          variant="secondary"
          disabled={link.data === undefined || change.isPending}
          onClick={() => {
            change.mutate('rotate')
          }}
        >
          {t('referral.rotate')}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasLink || change.isPending}
          onClick={() => {
            change.mutate('revoke')
          }}
        >
          {t('referral.revoke')}
        </Button>
      </div>
      <p className="text-xs text-ink-muted">{t('referral.rotateHelp')}</p>
    </Card>
  )
}
