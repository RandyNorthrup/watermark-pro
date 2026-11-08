import { canManageSite } from '../../shared/site-roles'

/**
 * Site management comes from the account role, never workspace ownership.
 * Kept apart from the administration API (`admin.ts`) so the app chrome can
 * ask without loading the auth client (PLAN.md §5.5).
 */
export function isPlatformAdmin(user: { role?: string | null | undefined }): boolean {
  return canManageSite(user.role)
}
