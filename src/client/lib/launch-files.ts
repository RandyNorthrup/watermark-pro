/**
 * PWA file handling (M16). When the operating system opens the installed app to
 * handle image files (the manifest's `file_handlers`), the browser delivers them
 * through `window.launchQueue`. The consumer in src/client/main.tsx reads the
 * launch, stashes the files here, and navigates to `launchTarget(files.length)`;
 * the destination route then drains them with `takeLaunchFiles` on mount.
 *
 * The store is a module-level buffer rather than router state because the files
 * arrive before the router has mounted the target route.
 */

/** Single image goes straight to the editor; a set goes to the bulk tool. */
const SINGLE_IMAGE_COUNT = 1

const pendingLaunchFiles: File[] = []

/** Where a launch of `count` files should land. */
export function launchTarget(count: number): '/app/editor' | '/app/bulk' {
  return count > SINGLE_IMAGE_COUNT ? '/app/bulk' : '/app/editor'
}

/** Replaces the pending launch files; the most recent launch wins. */
export function setLaunchFiles(files: readonly File[]): void {
  pendingLaunchFiles.length = 0
  pendingLaunchFiles.push(...files)
}

/** Returns the pending launch files and empties the buffer; a launch is consumed once. */
export function takeLaunchFiles(): File[] {
  return pendingLaunchFiles.splice(0)
}
