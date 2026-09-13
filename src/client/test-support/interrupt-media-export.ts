import { fireEvent, screen } from '@testing-library/react'
import type { userEvent } from '@testing-library/user-event'

import { setOfflineUser } from '../lib/offline-context'

/** The same user interruption must invalidate both document and video export jobs. */
export async function interruptMediaExport(
  action: 'edit' | 'cancel' | 'account' | 'unmount',
  user: ReturnType<typeof userEvent.setup>,
  unmount: () => void,
): Promise<void> {
  switch (action) {
    case 'edit': {
      fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
        target: { value: 'New Revision' },
      })
      return
    }
    case 'cancel': {
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      return
    }
    case 'account': {
      setOfflineUser('different-account')
      return
    }
    case 'unmount': {
      unmount()
    }
  }
}
