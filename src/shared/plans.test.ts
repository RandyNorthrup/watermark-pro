import { describe, expect, it } from 'vitest'

import {
  PUBLIC_PLANS,
  workspaceCapacity,
  workspacePlanRecordSchema,
  type WorkspacePlanRecord,
} from './plans'

const NOW = Date.UTC(2026, 9, 2)
const FREE_CAPACITY = { storageBytes: 524_288_000, photos: 100, logos: 10, members: 1 }
const PRO_CAPACITY = { storageBytes: 10_737_418_240, photos: 10_000, logos: 50, members: 1 }
const TEAM_CAPACITY = { storageBytes: 26_843_545_600, photos: 10_000, logos: 100, members: 3 }
const free: WorkspacePlanRecord = {
  organizationId: 'plan-fixture',
  kind: 'personal',
  basePlan: 'free',
  baseMemberLimit: 1,
  retainedMemberLimit: 1,
  paidPlan: null,
  paidThrough: null,
  paidAccessSuspended: false,
  revision: 0,
}
describe('authoritative workspace capacity', () => {
  it('keeps bounded primary collaboration for private members independently of Pro billing', () => {
    const privatePrimary = { ...free, basePlan: 'private' as const }
    expect(workspaceCapacity(privatePrimary, NOW).members).toBe(3)
    expect(
      workspaceCapacity({ ...privatePrimary, paidPlan: 'pro', paidThrough: new Date(NOW + 1) }, NOW)
        .members,
    ).toBe(3)
    expect(workspaceCapacity(free, NOW).members).toBe(1)
  })
  it('retains an explicit historical roster through paid renewal, expiry and suspension', () => {
    const historical = {
      ...free,
      kind: 'shared' as const,
      basePlan: 'legacy' as const,
      retainedMemberLimit: 7,
    }
    const paid = { ...historical, paidPlan: 'team' as const, paidThrough: new Date(NOW + 1) }
    expect(workspaceCapacity(paid, NOW).members).toBe(7)
    expect(workspaceCapacity(paid, NOW + 1).members).toBe(7)
    expect(workspaceCapacity({ ...paid, paidAccessSuspended: true }, NOW).members).toBe(7)
  })
  it('keeps the researched monthly catalog separate from effective limits', () => {
    expect([
      PUBLIC_PLANS.free.monthlyUsd,
      PUBLIC_PLANS.pro.monthlyUsd,
      PUBLIC_PLANS.team.monthlyUsd,
    ]).toEqual([0, 9, 24])
    expect(workspaceCapacity(free, NOW)).not.toHaveProperty('monthlyUsd')
  })
  it('public shared fallback ignores a stale private allowance but retains an explicit historical roster', () => {
    const publicShared = { ...free, kind: 'shared' as const, baseMemberLimit: 3 }
    expect(workspaceCapacity(publicShared, NOW).members).toBe(1)
    expect(workspaceCapacity({ ...publicShared, retainedMemberLimit: 4 }, NOW).members).toBe(4)
    expect(
      workspaceCapacity({ ...publicShared, paidPlan: 'team', paidThrough: new Date(NOW + 1) }, NOW)
        .members,
    ).toBe(3)
  })
  it('uses bounded public Free capacity rather than private limits', () => {
    expect(workspaceCapacity(free, NOW)).toMatchObject({
      storageBytes: 524_288_000,
      photos: 100,
      logos: 10,
      members: 1,
    })
    expect(workspaceCapacity(free, NOW).photos).not.toBe(10_000)
  })
  it.each(['private', 'legacy'] as const)(
    'preserves %s capacity independently of subscription state',
    (basePlan) => {
      expect(
        workspaceCapacity({ ...free, kind: 'shared', basePlan, baseMemberLimit: 5 }, NOW),
      ).toEqual({ storageBytes: 2_147_483_648, photos: 10_000, logos: 50, members: 5 })
    },
  )
  it('applies paid personal Pro only through a current nonsuspended paid period', () => {
    const paid = { ...free, paidPlan: 'pro' as const, paidThrough: new Date(NOW + 1) }
    expect(workspaceCapacity(paid, NOW)).toEqual(PRO_CAPACITY)
    expect(workspaceCapacity(paid, NOW + 1)).toEqual(FREE_CAPACITY)
    expect(workspaceCapacity({ ...paid, paidAccessSuspended: true }, NOW)).toEqual(FREE_CAPACITY)
    expect(workspaceCapacity({ ...paid, paidThrough: null }, NOW)).toEqual(FREE_CAPACITY)
  })
  it('a paid shared Team covers its workspace, preserving the separate private grant on downgrade', () => {
    const paid: WorkspacePlanRecord = {
      ...free,
      kind: 'shared',
      basePlan: 'private',
      baseMemberLimit: 3,
      paidPlan: 'team',
      paidThrough: new Date(NOW + 1),
    }
    expect(workspaceCapacity(paid, NOW)).toEqual(TEAM_CAPACITY)
    expect(workspaceCapacity(paid, NOW + 1)).toEqual({
      storageBytes: 2_147_483_648,
      photos: 10_000,
      logos: 50,
      members: 3,
    })
  })
  it.each([
    { paidPlan: 'team', paidThrough: new Date(NOW + 1) },
    { kind: 'shared', paidPlan: 'pro', paidThrough: new Date(NOW + 1) },
    { baseMemberLimit: 2 },
    { basePlan: 'admin' },
    { paidThrough: '2026-11-02' },
    { revision: -1 },
    { retainedMemberLimit: 0 },
    { browserTrusted: true },
  ])('rejects malformed or incompatible server records %j', (invalid) => {
    expect(workspacePlanRecordSchema.safeParse({ ...free, ...invalid }).success).toBe(false)
  })
})
