import type { Context } from 'hono'

import type { AppContext } from './app-context'
import { CLOUD_OPERATION_POLICY } from '../shared/cloud-operations'
import { ORGANIZATION_ROLES, roles, type PermissionRequest } from '../shared/permissions'

/** Capture roles from the same permission model, then persistence rechecks the actor's live role. */
export async function spendMemberOperations(
  c: Context<AppContext>,
  permissions: PermissionRequest,
  units: number,
): Promise<void> {
  const request: Record<string, string[]> = {}
  for (const [resource, actions] of Object.entries(permissions)) request[resource] = [...actions]
  await c.get('services').plans.spendOperations({
    kind: 'member',
    organizationId: c.req.param('orgId') ?? '',
    userId: c.get('session').user.id,
    roles: ORGANIZATION_ROLES.filter((role) => roles[role].authorize(request).success),
    units,
  })
}
/** Destructive/revocation paths keep their existing permission and never consume usage allowance. */
export function operationUnitsForPermission(permissions: PermissionRequest): number {
  const actions = Object.values(permissions).flat()
  if (actions.includes('delete') || actions.includes('revoke')) return 0
  if (actions.every((action) => action === 'read')) return CLOUD_OPERATION_POLICY.weights.read
  return actions.includes('upload')
    ? CLOUD_OPERATION_POLICY.weights.upload
    : CLOUD_OPERATION_POLICY.weights.write
}
