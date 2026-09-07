/**
 * Hands a rendered image to the platform share sheet (`navigator.share` with
 * files): on an iPhone that is how a photo reaches Photos, Messages or
 * Instagram, since a download lands in Files. Desktop browsers mostly lack
 * file sharing, so callers show the button only when `canShareFiles()`.
 */

/** A one-byte stand-in with the type the export will have, for the capability check. */
function probeFile(type: string): File {
  return new File([new Uint8Array(1)], 'probe', { type })
}

/** `navigator.share` is absent on desktop browsers; TypeScript types it as always present. */
function shareApi(): Partial<Pick<Navigator, 'share' | 'canShare'>> {
  return navigator
}

/** Whether this browser can share an image file of the given type. */
export function canShareFiles(type: string): boolean {
  const api = shareApi()
  if (typeof api.share !== 'function' || typeof api.canShare !== 'function') {
    return false
  }
  return api.canShare({ files: [probeFile(type)] })
}

export type ShareOutcome = 'shared' | 'dismissed'

/**
 * Opens the share sheet with the file. Resolves with whether the user picked
 * a target or dismissed the sheet; any other failure is thrown so the caller
 * can show it.
 */
export async function shareFile(blob: Blob, fileName: string): Promise<ShareOutcome> {
  const api = shareApi()
  if (typeof api.share !== 'function') {
    throw new TypeError('this browser cannot share files')
  }
  try {
    await api.share({ files: [new File([blob], fileName, { type: blob.type })], title: fileName })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'dismissed'
    }
    throw error
  }
}
