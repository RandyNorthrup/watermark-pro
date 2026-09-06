import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type ReactNode, useState } from 'react'

import { SHARE_EXPIRY_DAYS } from '../../../shared/constants'
import { describeError } from '../../lib/errors'
import { copyLink, createShare, shareLink, sharesQueryKey } from '../../lib/shares'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { ChoiceGroup } from '../ui/choice-group'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

interface ShareDialogProps {
  organizationId: string
  photoIds: readonly string[]
  /** Suggested title, for example the photo's name. */
  defaultTitle: string
  trigger: ReactNode
}

type ExpiryChoice = 'never' | `${(typeof SHARE_EXPIRY_DAYS)[number]}`

const EXPIRY_CHOICES: readonly { value: ExpiryChoice; label: string }[] = [
  ...SHARE_EXPIRY_DAYS.map((days) => ({
    value: String(days) as ExpiryChoice,
    label: days === 1 ? '1 day' : `${String(days)} days`,
  })),
  { value: 'never', label: 'Never' },
]

function isExpiryDays(value: number): value is (typeof SHARE_EXPIRY_DAYS)[number] {
  return (SHARE_EXPIRY_DAYS as readonly number[]).includes(value)
}

/**
 * Creates a share link for the given photos, then offers the link through
 * the platform share sheet or the clipboard.
 */
export function ShareDialog({ organizationId, photoIds, defaultTitle, trigger }: ShareDialogProps) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [expiry, setExpiry] = useState<ExpiryChoice>('7')
  const [outcome, setOutcome] = useState<'shared' | 'copied' | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => {
      const days = expiry === 'never' ? undefined : Number(expiry)
      return createShare(organizationId, {
        title: title.trim() || defaultTitle,
        photoIds: [...photoIds],
        ...(days !== undefined && isExpiryDays(days) && { expiresInDays: days }),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey(organizationId) })
    },
  })

  async function offer(url: string, how: 'share' | 'copy') {
    try {
      setOutcome(
        how === 'share' ? await shareLink(title.trim() || defaultTitle, url) : await copyLink(url),
      )
      setShareError(null)
    } catch (error_) {
      setShareError(describeError(error_))
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next)
        if (next) {
          setTitle(defaultTitle)
          setOutcome(null)
          setShareError(null)
          create.reset()
        }
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-6 shadow-card">
          <div>
            <Dialog.Title className="text-lg font-semibold">
              Share {String(photoIds.length)} photo{photoIds.length === 1 ? '' : 's'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              Anyone with the link can view and download these photos until it expires or you revoke
              it.
            </Dialog.Description>
          </div>
          {create.data === undefined ? (
            <>
              <Field label="Title">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={title}
                    maxLength={200}
                    onChange={(event) => {
                      setTitle(event.currentTarget.value)
                    }}
                  />
                )}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Expires after</span>
                <ChoiceGroup
                  label="Link expiry"
                  value={expiry}
                  choices={EXPIRY_CHOICES}
                  onChange={setExpiry}
                />
              </div>
              {create.isError ? (
                <Alert tone="error" title="Could not create the link">
                  {describeError(create.error)}
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  isPending={create.isPending}
                  onClick={() => {
                    create.mutate()
                  }}
                >
                  <Link2 aria-hidden="true" className="size-4" />
                  Create link
                </Button>
              </div>
            </>
          ) : (
            <>
              <Field label="Link">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    readOnly
                    value={create.data.url}
                    onFocus={(event) => {
                      event.currentTarget.select()
                    }}
                  />
                )}
              </Field>
              <p className="text-xs text-ink-muted">
                {create.data.expiresAt === null
                  ? 'This link does not expire.'
                  : `Expires ${new Date(create.data.expiresAt).toLocaleString()}.`}{' '}
                Manage links under Shares.
              </p>
              {outcome === null ? null : (
                <Alert tone="success">
                  {outcome === 'copied' ? 'Link copied to the clipboard.' : 'Link shared.'}
                </Alert>
              )}
              {shareError === null ? null : <Alert tone="error">{shareError}</Alert>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void offer(create.data.url, 'copy')
                  }}
                >
                  {outcome === 'copied' ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <Copy aria-hidden="true" className="size-4" />
                  )}
                  Copy link
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void offer(create.data.url, 'share')
                  }}
                >
                  <Share2 aria-hidden="true" className="size-4" />
                  Share…
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
