# Multi-clip video editor

The Videos page has a media pool, composited viewer, Clip/Watermark/Output
inspector and a six-lane timeline. V2 is composited above V1; A1–A4 mix together.
Desktop panels share a compact editing frame; light and dark modes use neutral
surfaces with rose action/selection accents and teal audio clips. Timeline picture
thumbnails come from the actual imported source, and Timing/Transform groups keep
clip intervals and picture controls separate. Inspector content scrolls independently.
Imported source files and the project remain on this device for the current
session. Reloading, starting New, leaving the page or changing account/workspace
clears them. Export a finished video before leaving. Project persistence and
project-file import/export are not implemented.

## Editing

Import one or more files with Import media or drop them onto the workspace.
Native demuxing decides whether each file contains usable video or audio; MIME
labels and extensions do not decide acceptance. Videos append on V1, with linked
camera sound on A1 when present. Independent sound starts on A3 at time zero.
The media pool retains imported sources for reuse and undo; its add buttons
append another instance on V1/V2 or A3/A4.

Select a timeline clip to edit its track, timeline start, source in/out or volume.
Picture clips also have position, scale and opacity. Split at playhead cuts the
selected source interval; trim handles change its source bounds, and dragging
the clip moves its timeline start. Arrow keys move a focused clip or trim handle
by approximately one output frame. Same-lane picture overlap is refused; use V2 for an
overlay. Gaps render black and silent. There are no transitions or invented
waveform displays.

Camera picture and sound move, trim and split together. Select linked sound and
choose Unlink audio before editing it independently. Removing either member of
a linked pair removes both. Track visibility and mute controls affect preview
and export. Undo/redo share one history with watermark edits, and a continuous
timeline drag is one history operation. Clear canvas removes watermarks while
retaining the edit; New clears the complete project and its retained sources.

Watermark keyframes and fades use project time, including across cuts. Select a
mark in the viewer or open the Watermark inspector to edit its design. The Output
inspector retains file settings, share and explicit cloud-save actions.

## Export and bounds

An untouched single video retains its existing native frame timing and compatible
packet-copy sound path. Edited projects render at 30 frames per second; edited
audio mixes at 48 kHz stereo in bounded chunks, then uses the target AAC or Opus
encoder. The browser must support the source decoders and output encoders. If
edited audible sound cannot be encoded, export reports an error; explicitly mute
those tracks or use a compatible browser.

Projects accept at most 32 source assets, 64 clips, two picture layers, four audio
lanes and ten minutes of timeline duration. Aggregate source bytes are capped at
2 GiB; native source duration and dimensions retain the existing limits. An
invalid interval, missing source, unsupported decoder or exceeded bound produces
an error. Cancellation and account/workspace changes invalidate pending work and
prevent a late export from replacing current output.

## Workspace navigation

On wide screens, the sidebar collapses to a half-circle bullet flush against the leading edge
of the workspace. Click it to expand labelled radial links, click a destination
to navigate, or use Escape/outside-click to dismiss. Escape restores focus to the
button. Closed destinations are absent from the tab order. Workspace selection
and persistent offline controls are in the header; phone tabs and their menu
sheet retain touch-sized navigation. Reduced motion removes the gooey animation.

The circle effect adapts [Lucas Bebber's Gooey Menu](https://codepen.io/lbebber/pen/LELBEo).
Its [MIT notice](licenses/gooey-menu.txt) is preserved. Filtered circle backgrounds
are separate from sharp text/icons; no remote fonts, styles or scripts are loaded.

The phone toolbar uses compact panel icons with the same accessible names as the
wide controls. Narrow timeline rulers retain three labelled seek points; zooming
into more timeline space restores intermediate labels. Audio files use a compact
music row, and their duration comes from the native source probe.
