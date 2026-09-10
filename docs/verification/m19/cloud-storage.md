# Cloud storage and native sharing — 2026-09-08

This is implementation and focused test evidence for the ongoing M19 work.
Live provider consent, real storage round trips and production deployment
remain separate release gates. No provider-console configuration or production
data was changed by this subtask.

## Delivered behavior

### Saving and native links

Google Drive, Dropbox and OneDrive now return confirmed saved-file identities,
names and provider-management URLs. Saving does **not** call a sharing endpoint.
The separate **Saved cloud files** dialog offers **Create public link**, **Copy
link**, **Revoke public link**, and a link to manage the file at its provider.
The UI explains that a public link grants view access to anyone who has it and
that existing destination-folder permissions continue to apply. These native
links complement the existing Lumafoil gallery-link feature; they do not
replace it.

Google requests an `anyone`/`reader` permission with discovery disabled and
records the exact permission ID for later revocation. OneDrive requests a
`view`/`anonymous` link and revokes its exact returned permission. Dropbox
creates a shared link, or retrieves the exact file's direct link when one
already exists, and revokes that URL. Provider policy failures remain visible
and leave the provider-management link available. Deleting a link does not
delete its file. The implementation follows the providers' primary
[Google Drive sharing documentation](https://developers.google.com/workspace/drive/api/guides/manage-sharing),
[Dropbox sharing guide](https://developers.dropbox.com/dbx-sharing-guide), and
[Microsoft Graph createLink documentation](https://learn.microsoft.com/en-us/graph/api/driveitem-createlink?view=graph-rest-1.0).

The saved-file/link list is intentionally temporary page state. It is not
persisted to localStorage, IndexedDB, the query cache or the Lumafoil server.
After leaving the page, users manage existing native access at the provider.
Access granted by another folder permission or another link is not claimed to
be revoked by removing the one link represented in this dialog.

### Non-destructive writes and partial progress

- Dropbox's new app uses **App Folder** access. Its upload path is now
  `/<filename>` relative to that app folder, avoiding the erroneous nested
  `Apps/Lumafoil/Lumafoil` directory. `add` with `autorename` preserves existing
  files. Filenames containing slash/backslash paths, control characters or
  traversal-only segments are rejected.
- OneDrive explicitly looks up or creates the `Lumafoil` folder before writing
  children. A concurrent folder creation is handled without treating a file
  named `Lumafoil` as a folder. The previous comment and implementation
  incorrectly assumed a simple PUT created parent directories.
- OneDrive writes through an upload session with `rename` on name conflict,
  using sequential 5 MiB chunks (a multiple of Graph's required 320 KiB
  alignment). The transfer verifies progress offsets and requires a completed
  `driveItem` acknowledgement. Early completion, wrong offsets, missing final
  acknowledgement, empty data and HTTP failures cannot become successful
  saves. No bearer token is sent to the preauthenticated upload URL. These
  choices follow Microsoft's [folder creation](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0)
  and [upload-session](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
  contracts.
- Each provider saves a batch serially. A failure retains confirmed prior
  saves, reports the confirmed count and the failed position, and leaves later
  files unsent. An interrupted request whose acknowledgement was lost is not
  falsely declared saved; the message tells the user to inspect the provider
  before retrying. Export bytes are generated lazily after authorization so a
  long render does not consume the click needed to open the sign-in popup.

### Identity, tokens and URL boundaries

- Cloud operations capture the Lumafoil account generation before asynchronous
  work. Identity is checked before later uploads and after awaited results,
  including body reads. Changing away and back still invalidates the earlier
  generation. Account events abort active fetches and clear provider-file and
  OneDrive-dialog state. Returned saved-file entries carry the app owner ID;
  link creation/revocation refuses a different owner before provider auth.
- Provider HTTP requests use `cache: no-store`, `credentials: omit` and
  `referrerPolicy: no-referrer`. Explicit bearer headers go only to their
  fixed API endpoints. Temporary download/upload URLs are validated against
  the expected Microsoft/Dropbox domain boundaries and never persisted.
- Microsoft MSAL is dynamically imported when OneDrive is used, uses
  `memoryStorage`, and is discarded on app-account transitions. First
  interactive auth requests account selection. Initialization failures are
  retryable. The implementation does not sign the user out of Microsoft
  globally. Microsoft's [MSAL caching guide](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching)
  documents the selected cache option.
- OneDrive lists every page of a folder while accepting next links only at
  the exact same Graph children endpoint. Repeated links and excessive page
  chains fail explicitly. Images with no download URL remain unavailable in
  the picker; non-images are omitted.
- Dropbox reserves its popup synchronously before deriving PKCE, generates
  an independent random state, validates returned state before exchanging a
  code, and closes on cancellation, timeout or app-account change. There is no
  refresh token or browser-persisted Dropbox credential. Its requested scopes
  now include `sharing.read` and `sharing.write`, in addition to the existing
  file read/write scopes. The flow follows the [Dropbox OAuth guide](https://developers.dropbox.com/oauth-guide).
- Google token and picker callbacks reject stale app-account results. Google
  account selection is requested explicitly. Failed SDK loads can be retried;
  provider tokens remain local variables rather than query-cache data.

## Verification performed

- Final combined unit/protocol/UI suite: **159 passed** across 21 files,
  including existing cloud import/export cases, the editor/bulk save journeys,
  negative protocol cases and account-cache checks.
- Scoped coverage run over the new transfer/sharing/upload modules and saved
  dialog: **128 passed**, **95.96% statements, 91.42% branches, 100% functions,
  96.17% lines**. The first scoped run failed the unchanged 85% branch gate at
  84.76%; actual missing folder/progress/revocation scenarios were added and
  the gate then passed. The full repository coverage gate remains separate.
- Tests independently assert exact native grant/revoke endpoints and bodies,
  no implicit share action on save, clipboard behavior, visible provider
  policy errors, partial-save counts, stale-result suppression, no old-owner
  callback delivery, URL credential/lookalike rejection, same-folder paging,
  non-overwriting request policy, aligned chunk boundaries, final upload
  acknowledgement, and no bearer header on the upload URL.
- Dropbox popup tests cover synchronous reservation, matching and forged
  state, token exchange, popup blocking, user cancellation, timeout and
  account-change closure. Microsoft auth tests assert `memoryStorage`, lazy
  instance reuse confined to one app account, new instance after account
  transition, account-selection prompts and late-popup rejection.
- Three targeted red drills changed the URL credential guard, Dropbox state
  validation and OneDrive rename policy. Each produced the intended assertion
  failure. Each file was restored byte-for-byte and its test returned green.
  These short mutations ran only after the other build owner confirmed its
  client build completed; both owners were notified when the build lock was
  released. Logs: `lumafoil-{cloud-url,dropbox-state,onedrive-no-overwrite}-{red,green}.log`
  in the task's temporary log directory.

## Remaining release gates

The implementation has not yet been proven against real Google, Dropbox and
Microsoft account consent plus real create/read/share/revoke requests from the
final `lumafoil.com` deployment. Provider tenant policy and app development-mode
limits may prevent public native links even when configuration is valid; the
UI handles that refusal but a simulated response is not live-provider proof.

The root integration task owns final full quality/coverage, security scanning,
production-build Playwright with axe, visual/device checks and deployment.
No new dependency was added by this cloud subtask. The existing MSAL package
was moved behind a dynamic import; the performance agent measured the editor
shared chunk falling from approximately 109 kB to 50.7 kB, with the 70.2 kB MSAL
chunk requested only for the cloud action.
