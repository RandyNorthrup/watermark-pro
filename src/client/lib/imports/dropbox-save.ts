/**
 * Save watermarked photos to Dropbox (M16 save-to-cloud). Reading uses the
 * Chooser (see `dropbox-chooser`), which needs no token; writing does, so this
 * module runs a browser OAuth 2.0 PKCE sign-in and then calls the Dropbox
 * content API directly. The Dropbox app has "Allow public clients (Implicit
 * Grant & PKCE)" enabled and registers `${origin}/oauth/dropbox` as a redirect
 * URI (production and localhost:5273).
 *
 * The flow: generate a random `code_verifier`, derive its S256
 * `code_challenge`, open a pop-up on `www.dropbox.com` to authorize, and poll
 * the pop-up's `location` — which is unreadable while it is cross-origin and
 * becomes readable only once it redirects back to our own `/oauth/dropbox`,
 * carrying `?code=…`. That code is exchanged for a short-lived access token at
 * `api.dropboxapi.com`, and each photo is uploaded to `content.dropboxapi.com`.
 * The pure pieces (base64url, the PKCE challenge, the authorize-URL builder, the
 * `Dropbox-API-Arg` builder and its header-safe escaper, the redirect parser)
 * are exported and unit-tested; the pop-up/token/upload glue stays thin over
 * them and is exercised only in a real browser.
 *
 * Deployment notes for the save to work: the CSP must allow
 * `https://api.dropboxapi.com` (token exchange) and
 * `https://content.dropboxapi.com` (upload) in `connect-src`; the pop-up is a
 * real window on `https://www.dropbox.com`, not a frame, so it needs no
 * `frame-src`. The response must send
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the opener can read
 * the pop-up's location after it lands back on our origin, and the SPA must
 * serve a same-origin page at `/oauth/dropbox` so that landing resolves.
 */
import { z } from 'zod'

import type { CloudUpload } from './source'
import type { PublicConfig } from '../../../shared/api'
import {
  CLOUD_SAVE_FOLDER,
  DROPBOX_OAUTH_AUTHORIZE_URL,
  DROPBOX_OAUTH_REDIRECT_PATH,
  DROPBOX_OAUTH_TOKEN_URL,
  DROPBOX_UPLOAD_ENDPOINT,
  DROPBOX_WRITE_SCOPES,
} from '../../../shared/constants'

/** Digest algorithm for the PKCE challenge. */
const SHA_256 = 'SHA-256'
/** RFC 7636 challenge method for a SHA-256-hashed verifier. */
const CODE_CHALLENGE_METHOD_S256 = 'S256'
/** Bytes of entropy in the PKCE verifier; 32 → a 43-char base64url string (RFC 7636 range). */
const CODE_VERIFIER_BYTES = 32
/** OAuth authorization-code flow markers. */
const RESPONSE_TYPE_CODE = 'code'
const GRANT_TYPE_AUTH_CODE = 'authorization_code'
/** `online` yields a short-lived token with no refresh token — enough for a one-shot upload. */
const TOKEN_ACCESS_TYPE_ONLINE = 'online'

const CONTENT_TYPE_HEADER = 'Content-Type'
const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '
const DROPBOX_API_ARG_HEADER = 'Dropbox-API-Arg'
const POST_METHOD = 'POST'
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'
const OCTET_STREAM_CONTENT_TYPE = 'application/octet-stream'
/** Dropbox write mode that never overwrites; paired with `autorename` to dodge name clashes. */
const UPLOAD_MODE_ADD = 'add'

/** Printable-ASCII bounds; anything outside must be `\u`-escaped for an HTTP header value. */
const FIRST_PRINTABLE_ASCII = 0x20
const LAST_PRINTABLE_ASCII = 0x7e
const HEX_RADIX = 16
/** A `\uXXXX` escape is always four hex digits. */
const UNICODE_ESCAPE_HEX_LENGTH = 4

/** Pop-up window name and size; a real window (not a frame) on www.dropbox.com. */
const POPUP_TARGET = 'watermark-pro-dropbox-oauth'
const POPUP_FEATURES = 'popup,width=600,height=720'
/** How often to check whether the pop-up has landed back on our redirect path. */
const POPUP_POLL_INTERVAL_MS = 400

/** base64url (RFC 4648 §5, unpadded) of raw bytes; the encoding PKCE and JWT-style values use. */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/**
 * The PKCE `code_challenge` for a verifier: base64url(SHA-256(verifier)). Async
 * because it uses `crypto.subtle.digest`. Matches RFC 7636's worked example, so
 * it is asserted against that vector in the unit test.
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(SHA_256, new TextEncoder().encode(verifier))
  return base64UrlFromBytes(new Uint8Array(digest))
}

/** A fresh, high-entropy PKCE `code_verifier` (43 URL-safe chars from 32 random bytes). */
function generateCodeVerifier(): string {
  const bytes = new Uint8Array(CODE_VERIFIER_BYTES)
  crypto.getRandomValues(bytes)
  return base64UrlFromBytes(bytes)
}

/** Inputs to the Dropbox authorize URL; the redirect URI is joined onto the app origin by the caller. */
export interface AuthorizeUrlInput {
  readonly appKey: string
  readonly codeChallenge: string
  readonly redirectUri: string
}

/**
 * The `www.dropbox.com/oauth2/authorize` URL the pop-up opens, carrying the
 * client id, the PKCE challenge and the registered redirect. Pure, so the query
 * it builds is unit-tested without opening a window.
 */
export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(DROPBOX_OAUTH_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: input.appKey,
    response_type: RESPONSE_TYPE_CODE,
    code_challenge: input.codeChallenge,
    code_challenge_method: CODE_CHALLENGE_METHOD_S256,
    redirect_uri: input.redirectUri,
    scope: DROPBOX_WRITE_SCOPES,
    token_access_type: TOKEN_ACCESS_TYPE_ONLINE,
  }).toString()
  return url.href
}

/**
 * Backslash-`u` escape every non-printable-ASCII code unit so the string is a
 * legal HTTP header value. `Dropbox-API-Arg` carries JSON in a header, and a
 * name with an accented or non-Latin character would otherwise be a non-ASCII
 * header value (rejected or mangled by `fetch`). Escaping per UTF-16 code unit
 * keeps a surrogate pair as the two `\u` escapes JSON already understands.
 */
export function escapeNonAscii(text: string): string {
  let escaped = ''
  for (let index = 0; index < text.length; index += 1) {
    // Iterate UTF-16 code units, not code points, so a surrogate pair becomes the
    // two `\uXXXX` escapes JSON understands; `codePointAt` would emit one
    // out-of-range value, so `charCodeAt` is deliberate here.
    // eslint-disable-next-line unicorn/prefer-code-point
    const code = text.charCodeAt(index)
    if (code >= FIRST_PRINTABLE_ASCII && code <= LAST_PRINTABLE_ASCII) {
      escaped += text.charAt(index)
      continue
    }
    escaped += String.raw`\u${code.toString(HEX_RADIX).padStart(UNICODE_ESCAPE_HEX_LENGTH, '0')}`
  }
  return escaped
}

/**
 * The `Dropbox-API-Arg` header value for uploading `name` into the app's save
 * folder: JSON that never overwrites (`add` + `autorename`) and stays quiet
 * (`mute`), run through {@link escapeNonAscii} so the whole value is ASCII. Pure
 * and unit-tested, including a name with a non-ASCII character.
 */
export function dropboxApiArg(name: string): string {
  const arg = {
    path: `/${CLOUD_SAVE_FOLDER}/${name}`,
    mode: UPLOAD_MODE_ADD,
    autorename: true,
    mute: true,
  }
  return escapeNonAscii(JSON.stringify(arg))
}

/**
 * The authorization code from the query string the pop-up lands on, or a
 * readable error when Dropbox returned `?error=…` or no code. Pure, so the
 * redirect handling is unit-tested without a pop-up.
 */
export function readAuthorizationCode(search: string): string {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  if (error !== null) {
    const description = params.get('error_description')
    throw new Error(`Dropbox sign-in failed: ${description ?? error}.`)
  }
  const code = params.get('code')
  if (code === null || code.length === 0) {
    throw new Error('Dropbox sign-in did not return an authorization code.')
  }
  return code
}

const tokenResponseSchema = z.object({ access_token: z.string().min(1) })

/** Refuse to run outside a browser with the crypto the PKCE flow needs. */
function assertBrowserWithCrypto(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Saving to Dropbox can only run in a browser.')
  }
  if (typeof crypto === 'undefined') {
    throw new Error('This browser lacks the Web Crypto API that Dropbox sign-in requires.')
  }
}

/**
 * Open the authorize pop-up and resolve the authorization code once it
 * redirects back to our origin. The pop-up's `location` is unreadable while it
 * is on `www.dropbox.com` and becomes readable only after landing on
 * `/oauth/dropbox`; polling swallows the cross-origin read until then. Rejects
 * when the user closes the window or Dropbox returns an error.
 */
function runAuthorizePopup(authorizeUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const popup = window.open(authorizeUrl, POPUP_TARGET, POPUP_FEATURES)
    if (popup === null) {
      reject(
        new Error('Could not open the Dropbox sign-in window. Please allow pop-ups and retry.'),
      )
      return
    }
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer)
        reject(new Error('Dropbox sign-in was cancelled.'))
        return
      }
      let search: string
      try {
        const { origin, pathname } = popup.location
        if (pathname !== DROPBOX_OAUTH_REDIRECT_PATH || origin !== window.location.origin) {
          return
        }
        search = popup.location.search
      } catch {
        // Still cross-origin on www.dropbox.com; the read throws until it lands.
        return
      }
      window.clearInterval(timer)
      popup.close()
      try {
        resolve(readAuthorizationCode(search))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Dropbox sign-in failed.'))
      }
    }, POPUP_POLL_INTERVAL_MS)
  })
}

/** Exchange the authorization code for a short-lived access token (PKCE, no client secret). */
async function exchangeCodeForToken(input: {
  appKey: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<string> {
  const response = await fetch(DROPBOX_OAUTH_TOKEN_URL, {
    method: POST_METHOD,
    headers: { [CONTENT_TYPE_HEADER]: FORM_CONTENT_TYPE },
    body: new URLSearchParams({
      code: input.code,
      grant_type: GRANT_TYPE_AUTH_CODE,
      client_id: input.appKey,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    }),
  })
  if (!response.ok) {
    throw new Error(`Dropbox token exchange failed (HTTP ${String(response.status)}).`)
  }
  const payload: unknown = await response.json()
  return tokenResponseSchema.parse(payload).access_token
}

/** Run the full PKCE sign-in and resolve an access token with the write scopes. */
async function authorize(appKey: string): Promise<string> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await deriveCodeChallenge(codeVerifier)
  const redirectUri = `${window.location.origin}${DROPBOX_OAUTH_REDIRECT_PATH}`
  const authorizeUrl = buildAuthorizeUrl({ appKey, codeChallenge, redirectUri })
  const code = await runAuthorizePopup(authorizeUrl)
  return await exchangeCodeForToken({ appKey, code, codeVerifier, redirectUri })
}

/** Upload one photo's bytes to the save folder, naming the file in any failure. */
async function uploadOne(token: string, upload: CloudUpload): Promise<void> {
  const response = await fetch(DROPBOX_UPLOAD_ENDPOINT, {
    method: POST_METHOD,
    headers: {
      [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}`,
      [CONTENT_TYPE_HEADER]: OCTET_STREAM_CONTENT_TYPE,
      [DROPBOX_API_ARG_HEADER]: dropboxApiArg(upload.name),
    },
    body: upload.blob,
  })
  if (!response.ok) {
    throw new Error(`Could not save "${upload.name}" to Dropbox (HTTP ${String(response.status)}).`)
  }
}

/**
 * Sign in to Dropbox (browser PKCE pop-up) and upload each watermarked photo to
 * the app's save folder, in order. `config.dropboxAppKey` is non-null when
 * Dropbox is offered; a null key means the deployment is misconfigured and
 * throws. Call from a user gesture so the browser allows the pop-up. Resolves
 * when every upload succeeds; rejects (naming the file and HTTP status) on the
 * first failure.
 */
export async function saveToDropbox(
  config: PublicConfig,
  uploads: readonly CloudUpload[],
): Promise<void> {
  const appKey = config.dropboxAppKey
  if (appKey === null) {
    throw new Error('Dropbox save is not configured for this deployment.')
  }
  assertBrowserWithCrypto()
  const token = await authorize(appKey)
  for (const upload of uploads) {
    await uploadOne(token, upload)
  }
}
