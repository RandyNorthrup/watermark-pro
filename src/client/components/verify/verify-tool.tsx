import { FileSearch } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { describeError } from '../../lib/errors'
import { readInvisibleFromFile } from '../../lib/read-invisible'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'

type CheckResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'found'; message: string }
  | { kind: 'none' }
  | { kind: 'error'; message: string }

/** Reads a hidden mark out of a chosen PNG; used on `/app/verify` and in the gallery dialog. */
export function VerifyTool() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<CheckResult>({ kind: 'idle' })

  async function check(file: File): Promise<void> {
    setResult({ kind: 'checking' })
    try {
      const message = await readInvisibleFromFile(file)
      setResult(message === null ? { kind: 'none' } : { kind: 'found', message })
    } catch (error) {
      setResult({ kind: 'error', message: describeError(error) })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="sr-only"
        aria-label="Photo to check"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file !== undefined) {
            void check(file)
          }
        }}
      />
      <div>
        <Button
          type="button"
          onClick={() => {
            inputRef.current?.click()
          }}
        >
          <FileSearch aria-hidden="true" className="size-4" />
          {t('verify.checkPng')}
        </Button>
      </div>
      {result.kind === 'checking' ? (
        <p className="text-sm text-ink-muted">{t('verify.checking')}</p>
      ) : null}
      {result.kind === 'found' ? (
        <Alert tone="success" title="Invisible mark found">
          {result.message}
        </Alert>
      ) : null}
      {result.kind === 'none' ? <Alert tone="info">{t('verify.noneFound')}</Alert> : null}
      {result.kind === 'error' ? <Alert tone="error">{result.message}</Alert> : null}
    </div>
  )
}
