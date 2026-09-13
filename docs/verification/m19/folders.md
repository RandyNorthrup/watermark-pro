# First-party folders — implementation and focused proof

Date: 2026-09-12. This records source-level and focused runtime evidence. It is
not a deployment certificate; the combined release build, browser/axe review,
full quality gates, and hosted checks remain with the parent release task.

## Implemented behavior

Library presets and Gallery photos have separate nested folder trees within
each workspace. Both collections use the same location picker, breadcrumbs,
folder actions, and move dialog. Owners, workspace admins, and editors retain
their existing content permissions; viewers can browse but cannot modify
folders or move content. Global site roles do not grant nonmember access.

Users can create, rename, move, and delete empty folders; move saved presets
or selected Gallery photos; choose folders when naming a preset, importing a
preset bundle, or saving an image output to Gallery. Library templates preserve
the selected destination when opening the new-preset form. The shared picker
also supports creating a destination inside a save dialog. The Image and Bulk
callers pass the selected Gallery destination through their existing save API.

Folders inherit workspace access. They are not separate sharing or permission
boundaries. Photo folders contain saved image outputs; PDF and video exports
are not silently uploaded or converted into Gallery photos.

Limits are explicit in `src/shared/folders.ts`: 100-character names, 12 nested
levels, 1,000 folders per workspace, and 500 content items per move. Names
cannot contain slashes or control characters. Sibling uniqueness uses Unicode
NFKC normalization and case folding. Deleting a folder never recursively
deletes content or subfolders.

## Persistence, authorization, and concurrency

Migration `0017_workspace_folders.sql` adds the folder table and nullable
folder IDs to existing photos/presets. Existing items remain at the collection
root; existing queued saves decode to `folderId: null`, revision zero, and no
version stamp. IndexedDB keeps its existing version and object stores.

Folder changes and content moves use the existing account-scoped durable
outbox. Parent creation, child creation, saves, and later moves replay in
journal order. Workspace preparation caches both trees and complete photo
metadata. Offline folder navigation can filter the prepared Gallery even when
that exact filtered URL has never been opened online. Reconciliation retires
only the acknowledged collection and folder kind.

D1 checks current membership, destination workspace/kind, ancestry, sibling
names, and expected versions inside the same transaction as the audit receipt
and mutation. Content moves are all-or-none. The expected item list uses one
JSON parameter rather than one SQL parameter per selected item. Replayed
operations return their stored receipt without reapplying a mutation, including
when an old deleted folder ID has subsequently been recreated.

Both numerical revisions and opaque operation UUID stamps guard folder edits
and content moves. A later local move cannot overwrite a remote move merely
because both changes reached the same numerical revision. Preset folder
reassignment is atomic with its content write and audit entry; content-only
preset edits preserve the latest folder. Photo upload commit rechecks current
membership and its destination after uploading bytes, preventing a deleted
destination or revoked member from committing metadata. The existing upload
cleanup journal handles uncommitted objects.

## Focused evidence

- Authenticated Node routes: `folders.test.ts`, `photos.test.ts`, and
  `library.test.ts`: 32 tests passed. Folder create/read/update/delete and
  content move exercise owner, admin, editor, viewer, nonmember, and anonymous
  access through real Better Auth sessions.
- Real D1/R2: `folders.workers.test.ts`, `uploads.workers.test.ts`, and
  `library.workers.test.ts`: 27 tests passed. Covers nested destinations,
  concurrent tree/content moves, wrong-workspace/kind rejection, stale version
  stamps, nonempty deletion, exact retry receipts, audit rollback, membership
  revocation at upload commit, destination deletion during upload, and unchanged
  uploaded bytes.
- Real Chromium IndexedDB: `offline-folders.browser.test.ts`,
  `offline-sync.browser.test.ts`, and `offline-preparation.browser.test.ts`:
  22 tests passed. Covers nested saves and moves across reopened state,
  dependency order, original binary data, old unfiled metadata, conflict
  retention, scoped reconciliation, and sign-in changes during replay.
- Client page/data tests: `folder-pages.test.tsx`, `preset-file.test.ts`, and
  `watermark-designer.test.tsx`: 18 tests passed. Covers folder CRUD,
  descendant exclusion, keyboard dismissal, actual Library move/save paths,
  and viewer-only Gallery controls. Shared folder and integration files pass
  scoped ESLint and Prettier checks.

Commands and output are retained under the ignored `temp/folders-*-proof.log`
files. Full-project type checking may include unrelated in-progress media/cloud
changes; its result must not be inferred from these focused tests. No production
migration, push, or deployment was performed by the folder implementation agent.
