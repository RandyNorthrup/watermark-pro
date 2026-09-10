/** OS launches wait here until their authenticated destination can consume them once. */
import {
  clearLaunchFiles,
  isCurrentLaunch,
  setCurrentLaunch,
  type Launch,
  type LaunchTarget,
} from './launch-state'
import { captureOfflineGeneration, currentOfflineUser } from './offline-context'

export { clearLaunchFiles, retainInitialLaunch } from './launch-state'

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
  setCurrentLaunch(launch)
  try {
    // Start reads immediately and observe failures while delivery code loads.
    // The lease above must exist before an import can yield to account admission.
    const [files, { publishLaunchFiles }] = await Promise.all([
      Promise.all(handles.map((handle) => handle.getFile())),
      import('./launch-consumer'),
    ])
    await publishLaunchFiles(launch, files, navigate)
  } catch {
    if (!isCurrentLaunch(launch)) return
    clearLaunchFiles()
    throw new Error('The files could not be opened. Open them again to retry.')
  }
}
