# Actual Chrome AAC gap defect — 2026-10-03

The merged full covered run failed its existing timestamp-gap assertion in both
Chromium page and Worker. Two console-only diagnostic attempts did not retain
measurements; their passing procedure counts are not audio evidence. A tiny
synthetic task-metadata/reporter capture then returned exact numeric controls
in Chromium and WebKit. The unchanged 30-second deadline actual probe captured
eight observations: two engines × page/Worker × gap/non-gap fixtures.

The original fixture has natural silence at 1.1–1.4 seconds and an encoded
timestamp discontinuity from 2 seconds that inserts one second. Original/native
input deltas preserve that jump in both engines. Chromium native output instead
continues in 1,024-frame chunks with no one-second discontinuity. Measured PCM
2.2–2.4 seconds contains tone where the inserted gap should be; final 4.2–4.4
seconds contain no tone. WebKit preserves the gap and final tone. Non-gap controls
contain tone in the same 2.2–2.4 window. Their final-tone control uses 3.6–3.8
seconds because their presentation is four seconds; gap fixtures use 4.2–4.4
seconds in their five-second presentation. Native frame totals sum AudioData
frames independently of presentation gaps, and native labels are observed before
SDK restoration. Decoders close and report no error.

This is a real displaced-output defect, not a valid silence-filled representation
and not proved by the earlier natural-rest RMS check. The adjacent JSON contains
only finite named-fixture measurements and a private raw-log hash. No runtime
patch, custom decoder, relaxed deadline or weakened assertion was introduced.
Review the existing SDK timeline mapping before implementing the smallest faithful
correction, then repeat full actual native page/Worker, priming/seek/gap/waveform/
cancellation/error and publication controls. Full M19 certification remains open.
