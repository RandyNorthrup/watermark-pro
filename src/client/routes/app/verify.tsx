import { createFileRoute } from '@tanstack/react-router'

import { VerifyTool } from '../../components/verify/verify-tool'

export const Route = createFileRoute('/app/verify')({
  component: VerifyPage,
})

function VerifyPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Verify a photo</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Check whether a PNG carries an invisible Watermark Pro mark and read its hidden message.
          Nothing leaves your browser.
        </p>
      </header>
      <VerifyTool />
    </div>
  )
}
