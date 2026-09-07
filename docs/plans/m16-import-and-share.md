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

The cloud pickers need three application registrations (Google,
Microsoft, Dropbox). You register them, in Randy's accounts, with the
Azure CLI and Chrome Control (see part 5). Build the credential-free
items first, register the applications, then the providers.

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

### 5. Cloud drives: users connect their own Google Drive, OneDrive or Dropbox

The OAuth here is user-facing. Watermark Pro is registered once, as an
application, with each vendor; every user then authorises _their own_
personal or work account from inside the app and picks files from it.
Nothing is tied to Randy's tenants, and no token ever reaches the Worker:
the vendors' browser SDKs obtain a short-lived access token in the page,
the picker shows the user's files, and the chosen files are downloaded in
the browser with that token. The app registrations use flows that need
no client secret (Google's token client, Microsoft's PKCE via MSAL,
Dropbox's Chooser), so the only configuration is public identifiers.

Each provider is a module implementing

```ts
export interface ImportSource {
  id: 'google-drive' | 'onedrive' | 'dropbox'
  label: string
  isConfigured(config: PublicConfig): boolean
  connect(): Promise<void> // first authorisation; remembered by the vendor SDK for the session
  pick(): Promise<File[]> // opens the provider's picker, downloads the chosen files in the browser
  disconnect(): void // forgets the session token
}
```

UI, kept simple: the "Open photo" / "Add photos" menu gains one entry per
configured provider ("From Google Drive", "From OneDrive", "From Dropbox").
The first use opens the vendor's own consent window; after that the
picker opens directly for the rest of the session. The account menu gets a
"Connected drives" item listing the providers with Connect / Disconnect,
so a user on a shared device can drop a connection. No server-side
storage of connections in this milestone; reconnecting is one click.

Configuration, all public, as `vars` in `wrangler.jsonc` (production and
the local `.dev.vars.example`), validated in `env.ts` (each optional;
a provider is offered only when its variables are set) and exposed
through `GET /api/config` (`publicConfigSchema`): `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID` (the numeric project
number), `MICROSOFT_CLIENT_ID`, `DROPBOX_APP_KEY`. CSP: `script-src` and
`frame-src` gain the provider origins (`https://apis.google.com`,
`https://accounts.google.com`, `https://docs.google.com` for the picker
frame, `https://www.dropbox.com`, `https://js.live.net`,
`https://login.microsoftonline.com`, `https://onedrive.live.com`), each
with a §9 row, and `connect-src` the download origins
(`https://www.googleapis.com`, `https://graph.microsoft.com`,
`https://content.dropboxapi.com`, `https://api.onedrive.com`). Lighthouse
best practices must not drop below 95 with those entries. Re-verify every
origin and scope against the vendor's current picker documentation on the
day (the M16 precedence rule): these were correct on 2026-09-06.

Scopes, the minimum that lets a picker work:

| Provider  | SDK in the page                                           | Scope                                        | Notes                                                                                          |
| --------- | --------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Google    | Google Identity Services token client + Google Picker API | `https://www.googleapis.com/auth/drive.file` | Non-sensitive with the Picker: no app verification; the user sees a plain consent screen       |
| Microsoft | MSAL.js (PKCE, SPA) + OneDrive File Picker v8             | Graph `Files.Read` (delegated)               | Audience "personal and work accounts" (multi-tenant + MSA); no admin consent                   |
| Dropbox   | Dropbox Chooser (`dropins.js`)                            | Chooser handles consent; `direct` link type  | The app key alone; the Chooser does not count against the development-mode user limit (verify) |

Google Photos is not included: its Picker API needs a sensitive scope and
Google's verification review; record it in §4 as a follow-up if wanted.

#### Registering the three applications (you do this, once)

Do this before the provider modules, so the variables exist for the e2e
run. Randy is signed in to all three vendors in his Chrome. Azure has a
CLI; Google and Dropbox register OAuth apps only through their web
consoles, so drive Randy's Chrome with the `chrome-control` MCP server
(snapshot → find refs → click/type; take a screenshot at each decision
point and keep them under `docs/setup/m16/` with any secrets cropped;
these registrations carry no secrets, only ids). Ask in one line before
starting each vendor ("Registering the Google OAuth app in your Chrome
now?"), because it acts in his account.

**Microsoft (Azure CLI 2.83, installed):**

```
az login --use-device-code
az ad app create --display-name "Watermark Pro" --sign-in-audience AzureADandPersonalMicrosoftAccount --query "{appId:appId,id:id}"
# add the SPA redirect URIs (Graph PATCH; `az ad app update` has no SPA flag)
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/<id>" --headers "Content-Type=application/json" --body "{\"spa\":{\"redirectUris\":[\"https://watermark.blowmoney.net/oauth/microsoft\",\"http://localhost:5273/oauth/microsoft\"]}}"
# delegated Files.Read on Microsoft Graph
az ad app permission add --id <appId> --api 00000003-0000-0000-c000-000000000000 --api-permissions 10465720-29dd-4523-a11a-6a75c743c9d9=Scope
```

`appId` is `MICROSOFT_CLIENT_ID`. Verify the permission id for
`Files.Read` with `az ad sp show --id 00000003-0000-0000-c000-000000000000 --query "oauth2PermissionScopes[?value=='Files.Read'].id"`
before using it.

**Google (Chrome Control on console.cloud.google.com):** create a
project "Watermark Pro"; APIs & Services → enable "Google Picker API" and
"Google Drive API"; Google Auth Platform → Branding: app name "Watermark
Pro", support email and developer contact (Randy's), home page
`https://watermark.blowmoney.net`, privacy and terms pages (add
`/privacy` and `/terms` static pages to the app in this milestone; short,
honest, generated from SECURITY.md's data-handling facts); Audience:
External, then Publish; Data access: add the scope `…/auth/drive.file`;
Clients → Create client → Web application, name "Watermark Pro web",
Authorised JavaScript origins `https://watermark.blowmoney.net` and
`http://localhost:5273`, no redirect URIs (the token client uses a popup);
copy the client id → `GOOGLE_OAUTH_CLIENT_ID`. Credentials → Create API
key, restrict to the Picker API and to HTTP referrers
`https://watermark.blowmoney.net/*` and `http://localhost:5273/*` →
`GOOGLE_PICKER_API_KEY`. The project number (Dashboard) →
`GOOGLE_PICKER_APP_ID`.

**Dropbox (Chrome Control on dropbox.com/developers/apps):** Create app →
Scoped access → "Full Dropbox" (the Chooser reads anywhere the user
picks) → name "Watermark Pro"; Settings → "Chooser / Saver / Embedder
domains": add `watermark.blowmoney.net` and `localhost`; Permissions:
`files.metadata.read`, `files.content.read`; copy the App key →
`DROPBOX_APP_KEY`. Leave the app in development status unless the
Chooser turns out to need production; record what you found.

Then: put the five values in `wrangler.jsonc` (`env.production.vars` and
the top-level `vars` for local), `npm run cf-typegen`, commit. The
milestone is certifiable only with all three providers working on the
production build, checked by hand in Randy's Chrome (pick a file from each
drive into the editor) and recorded in PLAN §8 with the date; the
automated tests use a fake `ImportSource` and the vendor SDKs are never
loaded in tests.

## Files

New: `src/client/lib/capture.ts` (`isCaptureSupported`),
`src/client/components/import/{take-photo-button,url-import-dialog,cloud-menu}.tsx`,
`src/client/lib/imports/{source,google-drive,onedrive,dropbox,url}.ts`,
`src/client/components/import/connected-drives.tsx`,
`src/client/routes/{privacy,terms}.tsx` (+ page tests)
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
(desktop-chrome) opens "From a link", submits `http://localhost:5273/sample-scene.jpg`
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
- [ ] the three applications registered (ids in `wrangler.jsonc`,
      screenshots under `docs/setup/m16/`); each picker checked by hand
      on the production build in Randy's Chrome and recorded in PLAN §8
- [ ] `/privacy` and `/terms` pages exist, are linked from the landing
      footer, and pass axe
- [ ] UX pass (docs/plans/README.md "Simple by default") written into §8
- [ ] version 1.8.0, tag, deploy, release
