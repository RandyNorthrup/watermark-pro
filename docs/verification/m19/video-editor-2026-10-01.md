# Multi-clip video workspace and navigation verification — 2026-10-01

## Scope and certification boundary

This receipt covers the owner-requested Resolve-style multi-clip editor, its native
composition/audio export engine, and the flush-edge half-circle gooey navigation.
The owner also explicitly requested a mature visual polish pass based on actual
online and desktop editor images. All work remains within M19; this receipt does
not certify that milestone or authorize publication without the unchanged release
gates.

The workspace now supports two picture layers, four audio lanes, cuts, source
trims, placement, linked camera audio, independent sound, transforms, lane controls
and a shared undo history. Native media probing and export perform real work;
unsupported encoding produces a visible refusal. Projects remain session-only:
closing the page discards the current edit, and changing account/workspace clears
its media and history. Imported source files stay on the user's device.

## Reference review

Actual product workspace screenshots were viewed from these official sources:

- [Blackmagic Design: Resolve Edit](https://www.blackmagicdesign.com/products/davinciresolve/edit)
  and its overview Edit-workspace image: compact connected panels, graphite
  surfaces, media pool, viewer, inspector and full-width timeline.
- [Adobe: Premiere audio workflow](https://news.adobe.com/news/news-details/2024/media-alert-adobe-premiere-pro-innovations-make-audio-editing-faster-easier-and-more-intuitive):
  restrained panel chrome, grouped controls and a readable transport/timeline.
- [Microsoft: Clipchamp video editor](https://clipchamp.com/en/video-editor/):
  browser-sized viewer emphasis and clear media/timeline hierarchy.
- [VEED: timeline documentation](https://support.veed.io/en/articles/10804541-what-you-need-to-know-about-veeds-timeline)
  and its product video-cutter workspace image: clean light panels, spare transport
  and readable source intervals.

Their copyrighted screenshots remain ignored temporary review files. Repository
visual receipts use Lumafoil's own coastal sample scene rendered into an actual
six-second H.264 fixture, together with the named synthetic audio fixture.

## Visual corrections

The review changed the former separated cards into one aligned editing frame on
wide screens. Light mode uses neutral white/slate panels; dark mode uses graphite.
The viewer receives more space, playback and timecode share one row, inspector
fields are grouped, timeline clips use actual decoded posters, and a ruler marker
makes the playhead visible. Rose identifies actions/selections; teal identifies
sound. Theme preferences remain authoritative.

Actual rendered review also exposed and corrected these defects:

1. Multiple media cards shrank and clipped their add controls. Cards now retain
   their height inside the media pool's own scroll region, and a real browser
   journey reuses a source on V2 and then proves Undo removes it.
2. A broad touch-enabled selector painted over watermark handles. Stage styling
   now targets the dedicated media viewport. Native verification asserts a
   transparent watermark frame as a negative regression.
3. Phone panel labels forced an extra toolbar row and timeline labels collided.
   Compact icons retain their accessible names. Narrow rulers retain three seek
   labels, with a rendered bounds assertion preventing renewed collisions.
4. Audio cards occupied empty picture-sized posters. They now use a compact music
   row with the natively measured duration, without invented waveforms.

5. Rejected clip edits displayed raw schema-error arrays. The editor now shows
   translated overlap/bounds guidance, while a negative regression proves that
   validation internals are absent and the existing clip remains unchanged.

The closed navigation trigger is 24 × 48 px and stays inside the wide layout's
32 px content margin. RTL mirrors the trigger and radial expansion. Filtered
circles and sharp labelled controls are separate; Escape, focus return, outside
clicks, route changes and reduced motion are covered by executable tests.

## Built visual evidence

The production-built local Worker was opened without injected preview styles,
using a synthetic local account and real video/audio fixtures. These screenshots
were viewed, not merely generated. Light/dark desktop, tablet, phone, Arabic RTL,
expanded gooey navigation and its short-window scrollable layout were reviewed.
The browser reported no uncaught errors. The RTL page had zero horizontal overflow;
the 24 px trigger mirrored to the trailing physical edge while the canvas stayed
clear. Real UI actions also split V1, reused and trimmed V2, and kept independent
A3 sound in the actual preview.

| Surface                            | Screenshot                                                       |
| ---------------------------------- | ---------------------------------------------------------------- |
| Wide light workspace               | [Desktop light](video-editor-2026-10-01/desktop-light.png)       |
| Wide graphite workspace            | [Desktop dark](video-editor-2026-10-01/desktop-dark.png)         |
| Real multi-clip edit               | [Cut/trim workspace](video-editor-2026-10-01/multiclip-dark.png) |
| Narrow touch layout                | [Phone](video-editor-2026-10-01/phone.png)                       |
| Tablet-width workspace             | [Tablet](video-editor-2026-10-01/tablet-dark.png)                |
| Arabic mirrored workspace          | [RTL](video-editor-2026-10-01/rtl-dark.png)                      |
| Expanded sharp radial controls     | [Gooey menu](video-editor-2026-10-01/gooey-dark.png)             |
| Short-window scrollable navigation | [Short RTL window](video-editor-2026-10-01/short-rtl-menu.png)   |

Desktop light, desktop dark and phone captures were replaced and viewed again
after the shared range primitive and translated validation-message corrections.
The other five captures retain the same reviewed layout geometry. The final
built visual review passed without browser errors; these captures do not replace
the complete four-device behavioral gate.

## Executable evidence

Verification is in progress on the final polished source. A stopped run is not a
pass, and CSS-injected development previews are not final built visual evidence.

- Focused native importer/composition/preview/viewer: 20 tests passed in four
  files after the transparent-overlay correction.
- Earlier focused editing, model, worker, shell and navigation checks: 71 passed.
- The previous complete covered run passed 2,832 tests and exposed two existing
  browser verification defects. Their corrected focused suite passed all 39
  tests. Existing deadlines, budgets and global coverage thresholds were retained.
- A subsequent full run exposed a 14,748 ms large-image adjustment against its
  unchanged 12,000 ms guard and a sticker catalogue decode deadline. That run was
  stopped after the failures. Native browser files now run serially after Node
  suites, using Vitest project sequencing rather than relaxing timing gates.
- The separated covered run passed all 2,834 tests in 260 files, plus 63 workerd
  tests. Coverage was 92.57% statements, 85.53% branches, 92.35% functions and
  93.50% lines. A later shared-primitive inventory failed on two inline ranges.
  Both now use the existing shared slider primitive; its unchanged inventory
  passes. A fresh complete pipeline remains necessary.
- Fresh complete `npm run quality` passed on the final shared-primitive source:
  2,834 covered tests in 260 files, 63 workerd tests, script/asset/CI suites,
  publication scans, audit, production build and unchanged bundle budgets.
  Coverage was 92.57% statements, 85.55% branches, 92.35% functions and
  93.51% lines. The initial application bundle was 138.7 kB against its 140 kB
  budget. Local log: `temp/video-polish-quality-primitives.log`.
- `npm run security:sast` passed: 510 rules, 2,148 files, zero findings.
  Local log: `temp/video-polish-sast-final.log`.
- The complete four-device `npm run test:e2e` ran all 136 tests: 119 passed and
  17 failed in 34.8 minutes. It is a failed gate. Evidence identified invalid
  range test input (`.5`), inspector selection before asynchronous media import
  completed, a recent-photo deletion regression, two deadline failures and
  local transport failures. Local log: `temp/video-polish-e2e-final.log`.
- The isolated WebKit offline diagnostic reproduced a 400 at redirected `/app`.
  Finite diagnostics identified rejected request-target syntax, rather than an
  application authentication failure. The gate bridge now accepts HTTP
  absolute-form only for its exact origin and Host, with credentials, fragments,
  foreign origins and request bodies still refused. Its positive/negative
  transport suite passed all 15 tests. The WebKit browser diagnostic now passes
  verified admission and reaches the actual offline save journey. That exposed
  a second defect: the designer awaited network invalidation after durable local
  success. Saved DTOs now update the library immediately with background refresh;
  five designer tests pass, including an unresolved-refresh regression. The
  subsequent focused four-device rerun exercised the actual offline journey.
- Range test inputs now use canonical `0.5`/`0.25` values, and the watermark
  inspector selection follows completed media import/playback. These corrections
  were verified in the focused rerun; no failed result is counted green.
- The fresh focused run completed 16 tests: seven passed and nine failed in
  8.9 minutes. Desktop Chrome and Android passed offline save/reload, recent
  work and the original single-clip export journey. iPhone passed offline saves.
  Native AAC export added 74.67 ms to a four-second edit on Chromium, failing
  the unchanged duration assertion. WebKit export timed out waiting for the
  download on both iPhone and iPad; three WebKit offline/recent-media cases
  also failed while transport requests remained pending. These remain open
  defects. Local log: `temp/video-regression-e2e.log`; retained traces:
  `temp/video-regression-results`. The prior desktop recent-delete failure did
  not recur, but this is not sufficient evidence that every race is resolved.
- The AAC timing defect corresponds to an open
  [upstream native-encoder priming report](https://github.com/Vanilagy/mediabunny/issues/444).
  The official AAC encoder extension also emits complete padded frames; adding
  it alone does not establish accurate output timing. No new codec dependency,
  duration tolerance relaxation or audio-dropping fallback was introduced.
- On 2026-10-02 bounded native development probes measured the encoded AAC
  output independently of the application: a four-second, 48 kHz stereo fixture
  produced 191 packets/4.074667 seconds in Chromium and 190 packets/4.053333
  seconds in WebKit. A raw WebKit decoder rejected the encoder's invalid AAC
  description; the pinned library already repairs that description, and the
  muxed probe used the repaired configuration. Chromium's decoded start marker
  appeared at 44.021 ms; the native WebKit packet decoder exposed its first
  marker at 65.313 ms. The end marker appeared at 4.043979 seconds in both.
  These local measurements are not claims about every operating system's AAC
  encoder, so no platform-specific priming constant was added to the product.
  An exploratory MP4 edit-list/tail-packet correction produced four-second
  packet/container durations and aligned the end marker in the library decoder.
  Native Web Audio decoding exposed an additional incompatibility: Chromium
  retained all 192,000 intended frames, but WebKit returned 190,336 frames,
  3.965333 seconds, with its last marker at 3.955979 seconds. The candidate was
  rejected rather than shipping accurate metadata with truncated native audio.
  None of these exploratory packet/box modifications is application code;
  AAC timing remains an open release blocker. Logs are
  `/tmp/lumafoil-native-aac-probe-corrected.log` and
  `/tmp/lumafoil-muxed-aac-native-decode.log`.
  Subsequent [Apple format documentation](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly)
  explains why an edit list alone is incomplete: explicit priming also requires
  the sample-group structures that disable the historical implicit-delay
  interpretation. Its [worked example](https://developer.apple.com/documentation/quicktime-file-format/example_representing_encoder_delay_explicitly)
  specifies the roll-group description and mapping. The fuller temporary
  experiment executed in both native engines. Chromium's Web Audio decoder
  returned 192,000 frames/four seconds, with markers at 0.021 ms and
  3.999979 seconds. WebKit restored the final marker at 3.999979 seconds but
  returned 192,448 frames/4.009333 seconds and retained a start marker at
  21.313 ms. Container duration was four seconds in both. The probe used the
  worked example's fixed delay only for this synthetic experiment; it does
  not prove the selected encoder's real priming and is not runtime code.
  No portable timing correction or certification is claimed. Log:
  `/tmp/lumafoil-muxed-aac-explicit-groups.log`.
- Subsequent chirp correlation isolated actual content alignment rather than
  interpreting an initial sine-wave threshold as encoder delay. Distinct
  synthetic chirps avoided the duplicate-marker ambiguity found in the first
  short experiment. The 341 ms fixture's library decoder measured a consistent
  2,112-sample delay in both local native encoders; the product measures this
  per export rather than assuming that value for another system. The candidate
  uses only the existing library's public source, packet-clone and `NullTarget`
  APIs, a bounded forwarding queue, silent codec-edge padding and the complete
  Apple edit-list/roll sample groups. A malformed or ambiguous measurement is
  an error, never an assumed successful export. The MP4 writer operates only on
  this pipeline's bounded output and rejects incompatible structure/timing.
  Calibration is synthetic, ephemeral and independent of user files.
  The focused pure batch passed 33 cases, including wrong packet counts,
  duplicate metadata, truncation, silence, ambiguity and inconsistent delay.
  Chromium passed ten existing composition cases plus five initial timing
  cases. The expanded native suite then passed all eight in each Chromium and
  WebKit, including missing PCM, mid-encode cancellation and injected forwarding
  failure. Real four-second output retains its exact library timeline and
  both chirp edges with correlation above 0.9 and alignment within one sample
  in both the library and native Web Audio decoders. Native Web Audio may expose
  less than one final padded AAC frame; it must retain every intended sample.
  This does not relax the existing project-duration assertion or replace the
  production-built device, complete quality, security and release gates.
  Logs: `/tmp/lumafoil-aac-timing-units.log`,
  `/tmp/lumafoil-aac-timing-native-expanded.log`,
  `/tmp/lumafoil-aac-timing-native-lifecycle.log` and
  `/tmp/lumafoil-aac-timing-webkit-lifecycle.log`.
  Complete type checking and final focused lint also passed. The fresh
  production-built cut/trim/audio/export journey passed all four devices in
  4.6 minutes: desktop 48.0 seconds, iPhone 1.4 minutes, iPad 1.6 minutes and
  Android 57.9 seconds. Native duration/audio checks and axe remain unchanged.
  Its buffer-only screenshot attachments were not retained by the line reporter,
  so this run is not claimed as a new reviewed screenshot receipt. Earlier
  actual UI captures remain retained; a fresh visual capture pass and the
  complete quality/SAST/device/release gates remain required. Log:
  `/tmp/lumafoil-video-measured-aac-e2e.log`.
- On 2026-10-02 a separate development native probe isolated the WebKit picture
  hang: the real two-second H.264 fixture stopped at seven rendered frames/eight
  queued encodes in both direct and dedicated-worker composition, while Chromium
  completed. A native configuration probe using low-latency encoding completed
  all 60 frames. The pinned library waits when its encoder queue reaches four;
  quality-mode lookahead retains frames beyond that bounded queue on this WebKit.
  Both pipelines now explicitly use low-latency encoding and verify every
  emitted packet after finalization, rejecting missing frames. Patched direct
  and real-worker probes completed in both engines, with 60 packets and exact
  two-second duration. These development probes do not replace production-build
  end-to-end certification. All 17 focused native cases passed, including both
  real-encoder omission negatives; lint diagnostics were corrected without
  suppressions. Fresh complete gates remain required.
  [The publisher documents](https://mediabunny.dev/api/VideoEncodingAdditionalOptions)
  that low-latency mode can omit frames under overload, which is why the explicit
  completeness check is load-bearing. Selected codec/bitrate/resolution and all
  application deadlines remain unchanged. No new dependency was added.
- The production-build first-video rerun was 3/4: iPhone, iPad and Android
  exported successfully with all original codec/frame/duration assertions and
  axe. Desktop timed out before export at Pause; its snapshot recorded an
  interrupted native Play request. Preview now records requested playback state
  synchronously, so a stale paused effect cannot interrupt a request before its
  React state commit. Seven focused preview/frame-integrity cases passed. The
  new startup regression was also executed against exact pre-fix index source:
  it failed because native media remained paused, and final source was restored
  byte-for-byte. Genuine native playback refusal remains a negative control.
  The corrected first-video journey then passed on all four devices in a fresh
  production build (5.4 minutes), with every original native codec/frame/duration
  assertion and axe retained. Log:
  `/tmp/lumafoil-video-playback-intent-e2e.log`; output:
  `temp/video-playback-intent-e2e-results`. The ready login surface was opened,
  captured and viewed without browser errors, and its owned browser was closed.
  Full multi-clip/audio, offline, quality/SAST and release gates remain pending.
  Fresh type checking also found and corrected an unsupported Testing Library
  `exact` option in the earlier durable-save test; the complete type check passed.
- The gate-bridge, durable-save and end-to-end corrections postdate the last
  complete quality/SAST receipts. Fresh complete gates remain required for
  the final source.
- The fresh canonical attempt stopped at a lint-invalid `void` fixture type in
  the durable-save test. It now resolves explicit `undefined`. The corrected
  attempt cleared formatting, lint, type/dead-code/localization checks and
  publication/audit, then hit two existing editor-page 20-second deadlines
  during covered tests while independent checks overlapped on the local Mac.
  It was explicitly interrupted at exit 130 after those failures; it is not
  a quality pass. Complete gates will be scheduled separately, retaining every
  deadline, performance budget and coverage floor.
- Final built visual review passed. Lighthouse and screenshot release matrices
  have not been rerun for this batch; M19 certification remains open.
- The subsequent isolated canonical attempt on 2026-10-02 cleared formatting,
  lint, type checking, dead-code/localization, publication scanning and npm audit.
  Covered tests observed two unchanged 20-second failures: first-watermark
  creation/application in `editor-page.test.tsx` and separate QR destination
  saves in `library-pages.test.tsx`. The turn was interrupted before the complete
  test/build result; the owned process is no longer running, and this attempt is
  not a quality pass. Its log is `/tmp/lumafoil-video-measured-aac-quality.log`.
  The focused native AAC and built four-device multi-clip proofs remain separate
  evidence. Full quality/device/security/release gates still need completion.
- Both observed deadline cases subsequently passed in an isolated, unmodified
  focused run. Their signature/URL fixtures now use actual clipboard paste after
  clearing the focused input, rather than replaying each character; typed names
  and every persistence, isolation, navigation and negative assertion remain.
  The changed focused cases both passed in 24.95 seconds total, with 13.51 seconds
  in test bodies. This is a focused execution, not complete coverage or quality
  certification; the original twenty-second deadline is unchanged. Log:
  `/tmp/lumafoil-video-paste-input-focused.log`.

## Planning status and next slice

Hosted source `c1a503a` passed canonical quality (2,877 covered cases and 63
workerd cases) and SAST (510 rules, 2,157 files, zero findings), plus complete
desktop/Android device jobs. Both WebKit device jobs failed multi-clip export;
the inspected iPad trace shows `AAC calibration returned an invalid decoded
extent`, followed by the unchanged sixty-second download wait. Its other 33
journeys passed. The gate rejected the candidate; no merge or deployment occurred.

`vitest.codecs.config.ts` and canonical `npm run test:codecs` now verify WebKit's
AAC path before complete device testing. The real synthetic timestamp contract
captures numeric encoder/demux/decoder origin metadata on failure, alongside the
existing exact waveform and native lifecycle controls. Nine Mac cases passed;
Linux conformance and the runtime correction remain pending. No bounds or
assertions were loosened. Docker's local daemon is unavailable, so the actual
hosted Linux runner supplies the remaining platform evidence.

The first added-gate head `5c2f3c3` stopped at duplication detection before codec
execution: its probe repeated nineteen lines of synthetic encoding preparation.
That was corrected by sharing the bounded calibration recording function, which
also records finite native packet origins. Nine Mac WebKit cases and the zero-
clone gate passed after extraction. This failed head supplies no Linux waveform
or calibration-origin proof; the remaining hosted probe is still required.

The shared head `eb69403` then passed all static/publication gates and 2,878
covered cases, before the new WebKit codec step failed five of nine cases. Its
synthetic contract recorded encoder/demux origins zero, 48 kHz decoded samples,
and only 15,360 decoded frames after 16,384 reference inputs. The unchanged minimum
extent check correctly refused that recording. The candidate encoder now submits
4,096 additional known silent calibration frames (about 85 ms), preserving the
entire original reference. The decoder window expands by exactly that submitted
padding; neither minimum extent, maximum measured delay, project duration nor
waveform tolerance is reduced. A new pure case proves bounded end-padding loss
can retain the reference, with a shortened-reference negative. All 34 pure cases
and nine Mac WebKit cases passed, followed by lint and complete type checking.
Hosted Linux execution and all final-source gates remain pending.

Padded source `b22e670` passed static/publication gates and 2,879 covered cases,
then its Linux codec step failed signal alignment. Its recording now had 20,480
decoded frames at 48 kHz, so the former extent failure was resolved; the measured
positive-delay peak still did not meet the unchanged correlation/uniqueness bar.
The next synthetic probe searches signed offsets for diagnosis only. A separate
read-only Linux codec workflow reduces feedback time without substituting for
required quality/device checks. Production timing remains unchanged until that
evidence supports a correction.

Signed Linux probe `c7e1cd4` found a strong later-marker peak at 576 frames
(correlation 0.99997), while the early marker peaked only at 0.20769. One valid
marker is insufficient to establish delay. The next synthetic contract therefore
records every decoded chunk extent and compares sequential sample placement with
the timestamp-based placement. No user samples are logged; production timing and
the two-marker requirement remain unchanged. Nine Mac cases, lint, full types and
zero duplication passed for this probe expansion.

Probe `9485baa` identified the actual Linux mismatch: decoded chunk timestamps
repeat at zero and 6,144 frames and skip intervening positions. Timestamp placement
overwrote PCM. The same complete samples in decode order preserved both markers
at 1,600 frames, with correlations 0.99998 and 0.99997. Production calibration now
assembles its known contiguous synthetic signal in that order, retaining exact
rate and generated-extent checks and the unchanged two-marker/delay guards. The
negative-offset branch became unreachable and was removed. All nine Mac cases,
lint, full type checking and zero duplication passed. Linux waveform/native
decoder conformance and full final-source gates remain required.

Linux source `f008171` passed calibration and lifecycle controls: eight native
cases passed, while exact four-second output/decoded-edge verification hit its
unchanged thirty-second limit. Test-stage diagnostics now identify where it
stalls without changing production behavior. All nine Mac cases and lint passed.
The Linux output waveform proof and full final source certification remain open.

Hosted `c5d1d3b` stage diagnostics located the thirty-second timeout in
`decode-library`; calibration, encoding, mux finalization and exact demuxed
duration completed. The next probe retains all assertions but checks native Web
Audio waveform first, then records only synthetic decoder packet timestamps,
counts and queue sizes using an unchanged pass-through native decode call.
Its corrected native-property capture passed all nine Mac cases, lint, full types
and zero duplication. Linux execution remains pending. Local SAST applied 510 rules to 2,161 targets and
reported zero findings, but rule timeouts occurred in test/generated files;
that is not a clean complete SAST certification.

The first stage-diagnostic publication attempt failed at the existing five-minute
Gitleaks deadline. Mac native cases, focused lint, complete types and duplication
checks passed, but this is not a publication pass. A normal-hook retry limits
local Go scheduler concurrency while retaining every byte, rule and original
deadline; no gate is bypassed.
That retry also timed out and refused the commit. The diagnostic source remains
unpublished, so it supplies no additional Linux-stage evidence.

M19 remains open. The owner added public free/paid monthly USD plans, Stripe
billing, private two-invitation membership, shared paid workspaces and explicit
human/trust gates during verification. This becomes the next implementation slice
after the current UI batch, with pricing and security research running meanwhile.
Shared mobile boot/LCP/TBT work, Account CLS, the three remaining desktop Lighthouse
surfaces, Arabic recent-photo and tablet password-reset screenshot journeys remain
required before release certification. The complete Lighthouse/screenshot release matrix must pass
before the protected automatic main deployment can publish production. Provider,
real hardware, offline and final release certification obligations remain tracked
in PLAN.md and the M19 specification.
