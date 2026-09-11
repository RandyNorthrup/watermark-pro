import { createContext, useContext } from 'react'

import type { ShellOrganization } from '../../shared/shell-cache'

/** The account-checked active organization displayed by the workspace shell. */
export const ActiveOrganizationContext = createContext<ShellOrganization | null>(null)

/** Read the same live organization that the shell displays after a create or switch. */
export function useActiveOrganization(): ShellOrganization | null {
  return useContext(ActiveOrganizationContext)
}
