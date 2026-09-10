import type { TestHarness } from './test-app'

/** Seed a real verified inviter row, preserving production's foreign-key and eligibility assumptions. */
export async function seedInviter(harness: TestHarness, id: string): Promise<void> {
  const context = await harness.services.auth.$context
  await context.adapter.create({
    model: 'user',
    forceAllowId: true,
    data: {
      id,
      email: `${id}@example.test`,
      name: 'Fixture inviter',
      emailVerified: true,
      banned: false,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}
