import { isOrganizationRole, type PermissionRequest, roles } from '../../shared/permissions'

/**
 * Client-side mirror of the server rule set. Used only to hide controls a
 * role cannot use; the Worker authorises every request independently.
 */
export function canRole(role: string | null | undefined, request: PermissionRequest): boolean {
  if (role === undefined || role === null || !isOrganizationRole(role)) {
    return false
  }
  return roles[role].authorize(request).success
}
