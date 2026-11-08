/**
 * Loads the Better Auth client with the first request that needs it. Signed-in
 * pages start from the bootstrap snapshot, so the client stays off their
 * critical path (PLAN.md §5.5); sign-in pages import it directly.
 */
export async function loadAuthClient() {
  const { authClient } = await import('./auth-client')
  return authClient
}
