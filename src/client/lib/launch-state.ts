/** Small synchronous lease state shared by OS file capture and its lazy consumers. */
import { captureOfflineGeneration, currentOfflineUser } from './offline-context'

export type LaunchTarget = '/app/editor' | '/app/bulk'
export interface Launch {
  userId: string | null
  assertCurrent: () => void
  files: File[]
}

const pending: { launch: Launch | null } = { launch: null }

/** Delivery must retain both the newest launch identity and its account generation. */
export function isCurrentLaunch(launch: Launch): boolean {
  if (pending.launch !== launch || launch.userId !== currentOfflineUser()) return false
  try {
    launch.assertCurrent()
    return true
  } catch {
    return false
  }
}

/** Read the pending lease; consumers still validate its account before draining it. */
export function currentLaunch(): Launch | null {
  return pending.launch
}

/** Record the newest lease before asynchronous file reads or consumer loading can yield. */
export function setCurrentLaunch(launch: Launch): void {
  pending.launch = launch
}

/** Explicit account locks cancel pending reads and ready files, including an unowned launch. */
export function clearLaunchFiles(): void {
  pending.launch = null
}

/**
 * The account-admission boundary alone carries a fresh, unowned OS launch across
 * its own reset and successful activation. Explicit relocks clear the lease;
 * this callback cannot revive it or replace a newer launch.
 */
export function retainInitialLaunch(): (() => void) | undefined {
  const launch = pending.launch
  if (launch?.userId !== null || !isCurrentLaunch(launch)) return undefined
  return () => {
    if (pending.launch !== launch) return
    launch.userId = currentOfflineUser()
    launch.assertCurrent = captureOfflineGeneration().assertCurrent
  }
}
