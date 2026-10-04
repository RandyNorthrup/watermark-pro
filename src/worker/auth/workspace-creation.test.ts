import { describe, expect, it } from 'vitest'

import { isWorkspaceCreationQuotaFailure } from './workspace-creation'

describe('workspace creation failure classification', () => {
  it('recognizes wrapped D1 capacity rejection without treating other constraints as quota', () => {
    const wrapped = new Error('Failed insert', {
      cause: new Error('D1_ERROR: workspace_creation_quota'),
    })
    expect(isWorkspaceCreationQuotaFailure(wrapped)).toBe(true)
    expect(
      isWorkspaceCreationQuotaFailure({
        message: 'Wrapped query',
        cause: { message: 'D1_ERROR: workspace_creation_quota' },
      }),
    ).toBe(true)
    expect(isWorkspaceCreationQuotaFailure(new Error('SQLITE_CONSTRAINT: organization.slug'))).toBe(
      false,
    )
    expect(isWorkspaceCreationQuotaFailure(new Error('workspace_creation_owner_immutable'))).toBe(
      false,
    )
  })
  it('rejects non-errors and terminates a cyclic cause chain', () => {
    const cyclic = new Error('Different constraint')
    Object.defineProperty(cyclic, 'cause', { value: cyclic })
    for (const value of [cyclic, null, undefined, 'workspace_creation_quota', {}])
      expect(isWorkspaceCreationQuotaFailure(value)).toBe(false)
  })
})
