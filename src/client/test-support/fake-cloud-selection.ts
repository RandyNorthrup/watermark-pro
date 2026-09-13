import { screen } from '@testing-library/react'

export const FAKE_CLOUD_TARGET = {
  folder: { id: 'selected-folder', name: 'Selected Folder', path: '/selected' },
  providerAccountId: 'provider-account',
  generation: 1,
}
export const FAKE_CLOUD_FILE = new File(['ORIGINAL PDF BYTES'], 'chosen.pdf', {
  type: 'application/pdf',
})

/** Exercise the same explicit provider/destination sequence in export and button-row suites. */
export async function chooseCloudSaveDestination(
  user: { click: (element: Element) => Promise<void> },
  provider: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Save to ${provider}` }))
  await user.click(await screen.findByRole('button', { name: 'Confirm Selection' }))
}
