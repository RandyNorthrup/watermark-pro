/** Editor/bulk delivery loads only when a destination or an OS launch needs it. */
import { currentLaunch, isCurrentLaunch, type Launch, type LaunchTarget } from './launch-state'
import { captureOfflineOwner } from './offline-context'

const SINGLE_IMAGE_COUNT = 1
const listeners = new Set<() => void>()

/** Where a launch of `count` files should land. */
export function launchTarget(count: number): LaunchTarget {
  return count > SINGLE_IMAGE_COUNT ? '/app/bulk' : '/app/editor'
}

/** Publish and navigate in the same account-fenced turn before subscribers drain files. */
export async function publishLaunchFiles(
  launch: Launch,
  files: File[],
  navigate: (target: LaunchTarget) => Promise<void>,
): Promise<void> {
  if (!isCurrentLaunch(launch)) return
  launch.files = files
  const navigation = navigate(launchTarget(files.length))
  for (const listener of listeners) listener()
  await navigation
}

/** Drain only files admitted to this account and destination; another route cannot steal them. */
export function takeLaunchFiles(target: LaunchTarget): File[] {
  const launch = currentLaunch()
  if (
    launch?.userId == null ||
    !isCurrentLaunch(launch) ||
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
