/**
 * Dropbox Chooser import (M16). Dropbox has no npm SDK for the Chooser: the
 * drop-in is delivered by a single `dropins.js` script that reads the app key
 * from its own `data-app-key` attribute, so this module injects that exact
 * `<script id="dropboxjs" data-app-key="…">` on demand and caches the injection
 * in a module-level promise (injected once per page). `Dropbox.choose` opens a
 * pop-up on `www.dropbox.com`; with `linkType: 'direct'` each chosen file
 * carries a temporary link on `dl.dropboxusercontent.com` that we fetch and
 * hand to `toImageFile`. The two shape-only helpers (accepted extensions,
 * selection mapping) are pure so they are unit-tested without a DOM or network.
 *
 * Deployment notes for the picker to work: the CSP must allow
 * `https://www.dropbox.com` in `script-src` and `frame-src` (the drop-in adds a
 * hidden relay iframe) and `https://dl.dropboxusercontent.com` in `connect-src`
 * (the direct-link fetch), and the response must send
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the pop-up keeps
 * its `window.opener` and can post the selection back — a bare `same-origin`
 * severs that link and the Chooser never resolves.
 */
import { cloudRequest, trustedCloudUrl } from './cloud-transfer'
import { toImageFile } from './download'
import type { PublicConfig } from '../../../shared/api'
import { DROPBOX_DROPINS_SCRIPT_URL, PHOTO_CONTENT_TYPES } from '../../../shared/constants'
import { captureOfflineOwner } from '../offline-context'

/** File extensions the Chooser should offer, one entry per accepted photo type. */
const EXTENSIONS_BY_CONTENT_TYPE: Record<(typeof PHOTO_CONTENT_TYPES)[number], readonly string[]> =
  {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
  }

/**
 * The `extensions` filter for the Chooser, derived from `PHOTO_CONTENT_TYPES` so
 * the accepted image kinds have a single source of truth. Pure and testable.
 */
export function imageExtensions(): string[] {
  return PHOTO_CONTENT_TYPES.flatMap((type) => EXTENSIONS_BY_CONTENT_TYPE[type])
}

/** The fields we read from a `Dropbox.choose` success entry: a name and a temporary direct link. */
export interface ChooserFile {
  readonly name: string
  readonly link: string
}

/**
 * Narrow the Chooser's success payload to the `{ name, link }` we download,
 * preserving order. Pure, so the download loop can stay thin over a tested map.
 */
export function toChooserSelections(files: readonly ChooserFile[]): ChooserFile[] {
  return files.map((file) => ({
    name: file.name,
    link: trustedCloudUrl(file.link, ['dropboxusercontent.com']),
  }))
}

/** Only the slice of the `window.Dropbox` global this module calls. */
interface DropboxGlobal {
  choose: (options: {
    linkType: 'direct'
    multiselect: boolean
    extensions: readonly string[]
    success: (files: readonly ChooserFile[]) => void
    cancel: () => void
  }) => void
}

declare global {
  interface Window {
    Dropbox?: DropboxGlobal
  }
}

const SCRIPT_ELEMENT_ID = 'dropboxjs'
const APP_KEY_ATTRIBUTE = 'data-app-key'
/** `linkType` value that yields temporary direct-download links rather than preview pages. */
const DIRECT_LINK_TYPE = 'direct'
const SCRIPT_LOAD_EVENT = 'load'
const SCRIPT_ERROR_EVENT = 'error'

/** Holds the one-per-page injection so the drop-in `<script>` is added only once. */
const dropinsCache: { promise: Promise<DropboxGlobal> | null } = { promise: null }

function injectDropins(appKey: string): Promise<DropboxGlobal> {
  return new Promise<DropboxGlobal>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('The Dropbox Chooser can only load in a browser.'))
      return
    }
    const alreadyLoaded = window.Dropbox
    if (alreadyLoaded !== undefined) {
      resolve(alreadyLoaded)
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ELEMENT_ID
    script.src = DROPBOX_DROPINS_SCRIPT_URL
    script.setAttribute(APP_KEY_ATTRIBUTE, appKey)
    script.addEventListener(SCRIPT_LOAD_EVENT, () => {
      const dropbox = window.Dropbox
      if (dropbox === undefined) {
        script.remove()
        reject(new Error('The Dropbox Chooser script loaded without exposing its API.'))
        return
      }
      resolve(dropbox)
    })
    script.addEventListener(SCRIPT_ERROR_EVENT, () => {
      script.remove()
      reject(new Error('The Dropbox Chooser script failed to load.'))
    })
    document.head.append(script)
  })
}

/** Inject the drop-in `<script>` once and resolve when `window.Dropbox` is ready. Memoised. */
async function loadDropins(appKey: string): Promise<DropboxGlobal> {
  const pending = dropinsCache.promise ?? injectDropins(appKey)
  dropinsCache.promise = pending
  try {
    return await pending
  } catch (error) {
    // Keep simultaneous callers on one attempt; a later user retry can reload it.
    if (dropinsCache.promise === pending) dropinsCache.promise = null
    throw error
  }
}

/** Open the Chooser and resolve the chosen entries (empty when the user cancels). */
function chooseFiles(dropbox: DropboxGlobal): Promise<ChooserFile[]> {
  const owner = captureOfflineOwner()
  return new Promise<ChooserFile[]>((resolve, reject) => {
    dropbox.choose({
      linkType: DIRECT_LINK_TYPE,
      multiselect: true,
      extensions: imageExtensions(),
      success: (files) => {
        try {
          owner.assertCurrent()
          resolve(toChooserSelections(files))
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error('Dropbox returned an invalid selection.'),
          )
        }
      },
      cancel: () => {
        resolve([])
      },
    })
  })
}

/** Download each direct link in order, turning the bytes into an image `File`. */
async function downloadSelections(selections: readonly ChooserFile[]): Promise<File[]> {
  const owner = captureOfflineOwner()
  const files: File[] = []
  for (const selection of selections) {
    owner.assertCurrent()
    const file = await cloudRequest(
      trustedCloudUrl(selection.link, ['dropboxusercontent.com']),
      { credentials: 'omit', referrerPolicy: 'no-referrer' },
      async (response) => {
        if (!response.ok) {
          throw new Error(
            `Could not download ${selection.name} from Dropbox (HTTP ${String(response.status)}).`,
          )
        }
        const blob = await response.blob()
        if (response.url !== '') trustedCloudUrl(response.url, ['dropboxusercontent.com'])
        return toImageFile(blob, selection.name)
      },
    )
    owner.assertCurrent()
    files.push(file)
  }
  return files
}

/**
 * Open the Dropbox Chooser and resolve the chosen photos as `File`s (empty when
 * the user cancels). `config.dropboxAppKey` is non-null when Dropbox is offered;
 * a null key means the deployment is misconfigured and throws. Call this from a
 * user gesture (e.g. a click handler) so the browser allows the pop-up.
 */
export async function pickFromDropbox(config: PublicConfig): Promise<File[]> {
  const appKey = config.dropboxAppKey
  if (appKey === null) {
    throw new Error('Dropbox import is not configured for this deployment.')
  }
  const owner = captureOfflineOwner()
  const dropbox = await loadDropins(appKey)
  owner.assertCurrent()
  const selections = await chooseFiles(dropbox)
  owner.assertCurrent()
  return await downloadSelections(selections)
}
