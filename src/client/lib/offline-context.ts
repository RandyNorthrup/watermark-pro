/** Current local workspace owner. This identity never substitutes for server authorization. */
const context: { userId: string | null; generation: number } = { userId: null, generation: 0 }

/** Called when the shell resolves a session, including its validated offline display snapshot. */
export function setOfflineUser(userId: string | null): void {
  if (userId === null || context.userId !== userId) {
    context.generation += 1
  }
  context.userId = userId
}

/** Fence identity discovery even before any account has been admitted to local data. */
export function captureOfflineGeneration(): { assertCurrent: () => void } {
  const generation = context.generation
  return {
    assertCurrent() {
      if (context.generation !== generation) {
        throw new Error('The signed-in account changed. Reopen this workspace to continue.')
      }
    },
  }
}

/** Capture before asynchronous work; a cookie/account transition invalidates every older result. */
export function captureOfflineOwner(): { userId: string; assertCurrent: () => void } {
  return { userId: offlineUserId(), ...captureOfflineGeneration() }
}

/** Account-boundary code may inspect an unset identity without admitting workspace operations. */
export function currentOfflineUser(): string | null {
  return context.userId
}

/** No operation may be stored or replayed without an explicit local owner. */
export function offlineUserId(): string {
  if (context.userId === null) {
    throw new Error('Sign in before saving workspace changes on this device.')
  }
  return context.userId
}

/** Browser storage is optional for online use, but required for durable offline saves. */
export function hasOfflineDatabase(): boolean {
  return typeof indexedDB !== 'undefined'
}
