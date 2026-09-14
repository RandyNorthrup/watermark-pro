import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Select existing watermarks in order through the shared media sidebar. */
export async function selectSavedWatermarks(
  user: UserEvent,
  ids: readonly string[],
): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await user.click(screen.getByRole('tab', { name: 'Saved' }))
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: index === 0 ? 'Saved Watermark' : 'Add A Saved Watermark',
      }),
      id,
    )
  }
}
