/**
 * Import a photo from a link. The Worker fetches the image server-side under
 * its SSRF policy and streams the bytes back; the client only POSTs the URL and
 * turns the response into a `File`. Typed API failures (400/413/415/429) arrive
 * as `ApiRequestError` thrown by `apiRequest` with a readable message and are
 * not swallowed here. Filename derivation is a pure helper so it needs no
 * network to test.
 */
import { apiRequest } from '../api'

const JSON_HEADERS = { 'content-type': 'application/json' }
const CONTENT_DISPOSITION_HEADER = 'content-disposition'
/** Stem for a name that cannot be read from the response or the link. */
const FALLBACK_STEM = 'imported'

/** RFC 5987 `filename*=charset'lang'value`, then a plain `filename=`; quotes stripped. */
function fileNameFromDisposition(header: string | null): string | null {
  if (header === null) {
    return null
  }
  const extended = /filename\*=(?:[^']*'[^']*')?([^;]+)/i.exec(header)
  const encoded = extended?.[1]
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded.trim())
    } catch {
      // A malformed percent-escape: fall through to the plain `filename=` form.
    }
  }
  const plain = /filename=("?)([^";]+)\1/i.exec(header)
  return plain?.[2]?.trim() ?? null
}

/** Last non-empty path segment of the URL, percent-decoded; null for a bare path. */
function fileNameFromUrl(url: string): string | null {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const last = pathname.split('/').findLast((segment) => segment.length > 0)
  if (last === undefined) {
    return null
  }
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** The MIME subtype (e.g. `png` from `image/png`), so a nameless import still carries one. */
function extensionFromType(contentType: string): string | null {
  const subtype = contentType.split(';', 1)[0]?.split('/', 2)[1]?.trim()
  return subtype !== undefined && subtype.length > 0 ? subtype : null
}

/**
 * The name to give the imported file: the response's `Content-Disposition`
 * filename first, then the URL's last path segment, then `imported.<ext>` from
 * the image's MIME type (or bare `imported` when the type carries no subtype).
 * Pure, so it is unit-tested without a network.
 */
export function deriveFileName(input: {
  contentDisposition: string | null
  url: string
  contentType: string
}): string {
  const fromHeader = fileNameFromDisposition(input.contentDisposition)
  if (fromHeader !== null && fromHeader.length > 0) {
    return fromHeader
  }
  const fromUrl = fileNameFromUrl(input.url)
  if (fromUrl !== null && fromUrl.length > 0) {
    return fromUrl
  }
  const extension = extensionFromType(input.contentType)
  return extension === null ? FALLBACK_STEM : `${FALLBACK_STEM}.${extension}`
}

/**
 * Fetches the image at `url` through the Worker's URL-import route and returns
 * it as a `File`. A non-2xx response surfaces as `ApiRequestError` (thrown by
 * `apiRequest`) carrying the mapped, user-facing message.
 */
export async function importFromUrl(organizationId: string, url: string): Promise<File> {
  const response = await apiRequest(`/api/orgs/${organizationId}/imports/url`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ url }),
  })
  const blob = await response.blob()
  const fileName = deriveFileName({
    contentDisposition: response.headers.get(CONTENT_DISPOSITION_HEADER),
    url,
    contentType: blob.type,
  })
  return new File([blob], fileName, { type: blob.type })
}
