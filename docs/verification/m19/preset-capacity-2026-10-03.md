# Saved-preset capacity — 2026-10-03

Status: uncommitted integration candidate, not deployed or certified. M19 is open.

## Existing boundary and invariants

The server previously bounded photo/logo storage and workspace members but did
not cap saved cloud presets. The catalog now limits Free to 20, Pro to 1,000,
Team to 2,000 and private/retained grants to 1,000 per workspace. These are count
bounds, not measurements of profitable operation/compute usage. Local editor
processing/exports and browser-local presets remain independent.

The existing route checks live server capacity after authentication/permission
and exact offline replay handling. Count uses an indexed aggregate rather than
loading every stored specification. The preset writer's existing transactional
INSERT SELECT checks the same current plan and count; denied competing writes
cannot create metadata or audit. Migration 0025 enforces direct INSERT and
cross-workspace movement. It does not rewrite historical presets. Read, edit,
delete and exact replay remain available after expiry/downgrade or suspension;
additional objects require space under the effective allowance.

The public/account UI displays counts with existing localized Saved Watermarks
labels and locale-aware formatting. Actual visual/axe proof is still pending.

## Executed evidence and corrections

- 47 selected real-auth Node/API and shared-plan cases passed, including six
  roles with positive/opposite authorization/quota controls and exact versus
  changed-content offline replay at full capacity.
- Six actual SQLite migration cases passed exact Free/private/Pro/Team INSERT
  boundaries, historical preservation/edit/deletion, full destination refusal
  and missing plan authority. These execute the actual migration SQL.
- The first scoped lint found test style errors; no rule was disabled. The
  first UI run passed 12 and failed one because the new code requested a
  nonexistent locale key. Full types also rejected DOM URL values passed to
  Node fs in the SQL fixture. The existing `library.heading` key and Node's
  URL constructor corrected those real mistakes. Final-source receipts follow
  when the current checks terminate; earlier passes are not relabeled.

## Remaining and next slice

Final preset scoped lint and full TypeScript passed. The corrected three-file
UI run passed all 13 cases. Combined actual workerd passed all 31 public,
creation, billing/lifecycle, auth and preset cases after an old public projection
fixture added the preset field to its expected response. Its earlier 30/31
attempt remains a failure. The two preset D1 cases prove one competing last-slot
admission/audit, direct INSERT enforcement and retained paid data through expiry,
suspension, edit and deletion. Focused passes do not replace global/rendered gates.

Verify rendered desktop/phone/RTL/axe and complete final-source global gates.
Complete
quality/SAST and device/release/provider gates remain required. The dependency
audit is unchanged and not waived. Next implement bounded monthly cloud
operations; preserve cleanup/revocation when a normal usage budget is exhausted,
and do not let unauthorized callers spend another workspace's budget.
