/** OS launches wait here until their authenticated destination can consume them once. */
import {
  captureOfflineGeneration,
  captureOfflineOwner,
  currentOfflineUser,
} from './offline-context'

const SINGLE_IMAGE_COUNT = 1
type LaunchTarget = '/app/editor' | '/app/bulk'
interface Launch {
  userId: string | null
  assertCurrent: () => void
  files: File[]
}
const pending: { launch: Launch | null } = { launch: null }
const listeners = new Set<() => void>()

/** Where a launch of `count` files should land. */
export function launchTarget(count: number): LaunchTarget {
  return count > SINGLE_IMAGE_COUNT ? '/app/bulk' : '/app/editor'
}

function isCurrent(launch: Launch): boolean {
  if (pending.launch !== launch || launch.userId !== currentOfflineUser()) return false
  try {
    launch.assertCurrent()
    return true
  } catch {
    return false
  }
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
  if (launch?.userId !== null || !isCurrent(launch)) return undefined
  return () => {
    if (pending.launch !== launch) return
    launch.userId = currentOfflineUser()
    launch.assertCurrent = captureOfflineGeneration().assertCurrent
  }
}

/**
 * Capture ownership before reading handles. A newer OS event supersedes older
 * reads even when they finish out of order; stale failures cannot affect it.
 */
export async function receiveLaunchFiles(
  handles: readonly Pick<FileSystemFileHandle, 'getFile'>[],
  navigate: (target: LaunchTarget) => Promise<void>,
): Promise<void> {
  if (handles.length === 0) return
  const launch: Launch = {
    userId: currentOfflineUser(),
    ...captureOfflineGeneration(),
    files: [],
  }
  pending.launch = launch
  try {
    const files = await Promise.all(handles.map((handle) => handle.getFile()))
    if (!isCurrent(launch)) return
    launch.files = files
    // Start navigation before listeners drain the batch. No await may separate
    // the account fence from either publication or navigation.
    const navigation = navigate(launchTarget(files.length))
    for (const listener of listeners) listener()
    await navigation
  } catch {
    if (!isCurrent(launch)) return
    clearLaunchFiles()
    throw new Error('The files could not be opened. Open them again to retry.')
  }
}

/** Drain only files admitted to this account and destination; another route cannot steal them. */
export function takeLaunchFiles(target: LaunchTarget): File[] {
  const launch = pending.launch
  if (
    launch?.userId == null ||
    !isCurrent(launch) ||
    launch.files.length === 0 ||
    launchTarget(launch.files.length) !== target
  )
    return []
  const files = launch.files
  launch.files = []
  return files
}

/** Mounted destinations receive both the initial launch and later same-route launches. */
export function subscribeLaunchFiles(
  target: LaunchTarget,
  consume: (files: File[]) => void,
): () => void {
  const owner = captureOfflineOwner()
  const receive = () => {
    try {
      owner.assertCurrent()
    } catch {
      return
    }
    const files = takeLaunchFiles(target)
    if (files.length > 0) consume(files)
  }
  listeners.add(receive)
  receive()
  return () => {
    listeners.delete(receive)
  }
}
