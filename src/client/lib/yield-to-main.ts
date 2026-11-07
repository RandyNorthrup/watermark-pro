/**
 * Ends the current main-thread task so the browser can paint and handle input
 * before the next unit of startup work (PLAN.md §5.5 mobile blocking-time
 * budget). `scheduler.yield()` resumes ahead of other queued tasks where the
 * browser provides it; elsewhere a zero-delay timer ends the task the same way,
 * only without that priority.
 */
export function yieldToMain(): Promise<void> {
  const { scheduler } = globalThis as { scheduler?: { yield?: () => Promise<void> } }
  if (typeof scheduler?.yield === 'function') {
    return scheduler.yield()
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
