# M16 — Import and share surfaces: camera, URL, share target, file handling, cloud drives

## Goal

eZy imports from the camera, the camera roll, Google Drive, Facebook and
Instagram; Watermarkly from Google Drive, Google Photos and Dropbox;
iWatermark+ from iCloud, Dropbox, Google Drive, Box and OneDrive, and
installs as an Apple Photos extension and a Shortcut. No product imports
from a URL. After M16 the editor and bulk tool take photos from the
camera, from a pasted URL, from another app's share sheet (Android
Chrome), from the desktop (double-click a file when installed), and from
Google Drive, Dropbox and OneDrive where credentials exist.

Research: `docs/competitor-research.md` §1.8 (Import sources), §3.2.

Two of the five items need credentials that only Randy can mint (cloud
pickers). Everything else is credential-free. Build the free items first,
then ask.

## Behaviour

### 1. Camera capture (phones and tablets)

Next to "Open photo" / "Add photos" on coarse-pointer devices a "Take
photo" button: a second hidden `<input type="file" accept="image/*"
capture="environment">`. On desktop the button is hidden (`pointer-fine`).
The captured file flows through the same path as a picked file (metadata
read, EXIF orientation applied by the browser).

### 2. Import from URL

"From a link" button (editor and bulk): a small dialog with a URL field
and "Fetch". The browser cannot fetch most image hosts directly (CORS), so
the Worker proxies:

`POST /api/orgs/:orgId/imports/url` body `{ url }`, permission
`photo: ['create']` (editors and above), returns the image bytes with the
sniffed content type and `Content-Disposition: inline; filename="<name>"`,
or a typed error. Rules, all tested:

- `https:` only; no credentials in the URL; hostname must not be an IP
  literal, `localhost`, end in `.local`, `.internal`, `.arpa`, or be a
  Cloudflare-internal name; the Worker's outbound fetch follows at most 3
  redirects and re-checks every hop against the same rules
  (`redirect: 'manual'`).
- Response must be ≤ `MAX_PHOTO_BYTES` (existing 40 MB) by `Content-Length`
  and by counting while streaming; the first 16 bytes are sniffed with the
  existing `sniffImageType`; anything else is `unsupported_type`.
- Timeout 15 s (`AbortSignal.timeout`); the upstream response is streamed
  through, never buffered in the Worker beyond the sniff window.
- Rate limit: the existing general limiter bucket plus a dedicated
  `imports` limiter of `10 per minute per user` (a new Rate Limiting
  binding `IMPORT_RATE_LIMITER` in `wrangler.jsonc`; run `cf-typegen`).
- Audited: `photo.import_url` with the hostname (not the full URL).
- Never cached (`Cache-Control: no-store`); the browser turns the response
  into a `File` named from the URL's last path segment or `imported.<ext>`.

### 3. Web Share Target (Android Chrome, installed app)

`public/manifest.webmanifest` gains:

```json
"share_target": {
  "action": "/share-target",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "files": [{ "name": "photos", "accept": ["image/jpeg", "image/png", "image/webp"] }] }
}
```

A share target with files requires a service worker to receive the POST.
Add `public/share-target-sw.js` (plain JS, ES2020, no bundler): scope
`/share-target` only, registered from `main.tsx` with
`navigator.serviceWorker.register('/share-target-sw.js', { scope: '/share-target' })`
when supported. Its `fetch` handler answers the POST by reading the form
data, storing the files in IndexedDB (`watermark-pro-shared` store,
`pending` key, with a timestamp) and responding with a 303 redirect to
`/app/bulk?shared=1`. The bulk page, on `?shared=1`, reads and clears the
store and adds the files as if dropped. The worker does **no caching and
no fetch interception outside its scope**; it must stay under 60 lines so
it can be reviewed by eye. CSP: `worker-src 'self'` already allows it (check
`public/_headers`; add if missing). Files older than 10 minutes in the
store are discarded.

### 4. File handling (installed desktop app, Chromium)

Manifest `file_handlers`:

```json
"file_handlers": [{ "action": "/app/editor", "accept": { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] } }]
```

`main.tsx`: if `'launchQueue' in window`, `window.launchQueue.setConsumer`
collects `launchParams.files` (`FileSystemFileHandle[]`), and the editor
route reads them from a tiny in-memory store (`lib/launch-files.ts`): one
file opens in the editor; several go to `/app/bulk`.

### 5. Cloud drives (needs credentials: ask Randy first)

Each provider is a module implementing

```ts
export interface ImportSource {
  id: 'google-drive' | 'dropbox' | 'onedrive'
  label: string
  isConfigured(config: PublicConfig): boolean
  pick(): Promise<File[]> // opens the provider's picker, downloads the chosen files in the browser
}
```

behind a "From cloud" menu that lists only configured providers. The
providers use the vendors' own JavaScript pickers, loaded from their
origins only when the menu is opened, and download the chosen files with
the short-lived token the picker returns, all in the browser; the Worker
sees nothing. Configuration is public (client ids / app keys are not
secrets): `GOOGLE_PICKER_CLIENT_ID`, `GOOGLE_PICKER_API_KEY`,
`DROPBOX_APP_KEY`, `ONEDRIVE_CLIENT_ID` as `vars` in `wrangler.jsonc`,
exposed through `GET /api/config` (`publicConfigSchema`), validated in
`env.ts` (each optional; a provider is offered only when its variables are
set). CSP: `script-src` and `frame-src` gain the provider origins
(`https://apis.google.com`, `https://accounts.google.com`,
`https://www.dropbox.com`, `https://js.live.net`, `https://onedrive.live.com`),
each with a §9 row, and `connect-src` the download origins. Lighthouse
best-practices must not drop below 95 with those entries.

What to ask Randy, in one line each, before building this part: the
Google Cloud OAuth client id + API key (Picker API enabled), a Dropbox app
key (Chooser), a Microsoft Entra app id (OneDrive picker). The milestone
is certifiable without them: the code path is tested with a fake
`ImportSource`, and the providers stay hidden until the variables exist.

## Files

New: `src/client/lib/capture.ts` (`isCaptureSupported`),
`src/client/components/import/{take-photo-button,url-import-dialog,cloud-menu}.tsx`,
`src/client/lib/imports/{source,google-drive,dropbox,onedrive,url}.ts`
(+ tests with fetch mocks), `src/client/lib/launch-files.ts` (+ test),
`src/client/lib/shared-files.ts` (IndexedDB read/clear; + jsdom test with
`fake-indexeddb` — pin it, devDependency, or use a minimal in-memory
`indexedDB` fake in `test-support`), `public/share-target-sw.js`,
`src/worker/routes/imports.ts` (+ `imports.test.ts` Node: allow/deny
table for URLs, redirect re-check, size cap, sniff, rate limit 429, RBAC
viewer 403; + `imports.workers.test.ts` against a stubbed upstream via
`fetchMock` from `cloudflare:test`), `src/worker/url-policy.ts` (pure
allow/deny; + test).

Modified: `wrangler.jsonc` (binding, vars), `worker-configuration.d.ts`,
`env.ts` (+ test), `src/shared/api.ts` (`urlImportRequestSchema`,
`publicConfigSchema` additions), `public/manifest.webmanifest`,
`public/_headers`, `main.tsx`, `editor.tsx` + `bulk-tool.tsx` (buttons),
`app-shell.tsx` (nothing), README, SECURITY.md, threat model (SSRF row,
share-target row, third-party picker origins row), PLAN §9 rows for the
CSP origins.

## Tests

Worker: the URL policy table (20 cases: http, ftp, credentials, IP v4/v6,
localhost, `.internal`, punycode, valid); redirect to a denied host → 400
`unsupported_url`; oversize by header and by stream → 413; non-image →
415; success streams bytes with the sniffed type; viewer → 403; limiter
→ 429 with `Retry-After`; audit row written with hostname only.

Client: `url.ts` turns a response into a `File` with the right name and
type; `shared-files.ts` reads and clears; `launch-files.ts` routes one
file to the editor and several to bulk; page tests: "Take photo" hidden
with `pointer: fine` (matchMedia fake) and shown with `coarse`; URL dialog
success adds the file to the editor (fake fetch); cloud menu hidden with
no config and lists the configured providers with a fake `ImportSource`.

e2e: the preview Worker in e2e serves the app over plain http and the
policy requires a public https host, so the successful URL import journey
lives in the Node and workerd tests only. `e2e/editor.spec.ts`
(desktop-chrome) opens "From a link", submits `http://localhost:5173/sample-scene.jpg`
and asserts the validation message "Only https links can be imported".
Android share target: not automatable; the service worker is
unit-tested by importing it into a jsdom test with a fake `self`
(`share-target-sw.test.ts` exercises the fetch handler with a synthetic
`FormData` request and asserts the IndexedDB write and the 303).

Red drills:

| Name                                          | Mutation                                                       | Command                            |
| --------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| URL import: private hosts allowed             | `url-policy` allows IP literals                                | unit-worker `url-policy.test`      |
| URL import: redirects not re-checked          | follow redirects automatically                                 | unit-worker `imports.test`         |
| URL import: size cap ignored while streaming  | counting removed                                               | unit-worker `imports.test`         |
| URL import: declared type trusted             | sniff skipped                                                  | unit-worker `imports.test`         |
| URL import: viewers can import                | permission changed to `read`                                   | unit-worker `imports.test`         |
| Share target: files kept forever              | age check removed                                              | unit-client `shared-files.test`    |
| Share target SW: caches responses             | add a `caches.open` call → test asserts no cache API use (spy) | unit-client `share-target-sw.test` |
| Cloud: provider offered without configuration | `isConfigured` returns true                                    | unit-client `import.test`          |

## Docs

README: "Getting photos in" section (picker, camera, drag, folder, link,
share sheet on Android, desktop file handling, cloud drives when
configured) with the exact environment variables; SECURITY.md: the URL
import controls, the service worker's scope and behaviour, the picker
origins; threat model rows; runbook: how to set the picker variables.

## Security and privacy

- SSRF is the risk of the URL import; the policy module is the control,
  the redirect re-check is the second control, the size/type/timeout caps
  the third, the audit row the fourth. Workers cannot reach RFC 1918
  addresses, but the policy still denies them so a future runtime change
  cannot open a hole.
- The share-target service worker intercepts one path and stores files
  for ten minutes at most; it never serves app assets, so it cannot
  become a stale-asset or cache-poisoning vector.
- Cloud pickers run third-party code from their origins inside the page
  (CSP-listed) and hand back short-lived tokens the app uses once, in the
  browser, to download the chosen files; tokens are never sent to the
  Worker or stored.

## Certification checklist

- [ ] gates, drills red, Lighthouse (best practices ≥ 95 with the new CSP
      origins), screenshots (import dialog; the cloud menu appears only
      when a provider is configured, so the screenshot set documents
      whichever state the preview build has)
- [ ] if Randy provided credentials: a manual check of each picker on the
      production build, recorded in PLAN §8 with the date; else the
      providers are listed in PLAN §4 as waiting on credentials
- [ ] version 1.8.0, tag, deploy, release
