# Brand Shape Studio

A browser-based generator that rebuilds photos and videos from one to five custom brand shapes. Every shape stays inside a square grid cell and keeps its original proportions and orientation.

## Main features

- Upload a JPG, PNG, WebP, MP4, MOV or WebM source.
- Upload up to five transparent SVG, PNG, WebP or JPG brand shapes.
- Map shapes by tone, sequence or stable random distribution.
- Control grid density, shape scale, contrast, tone, rotation and brand colors.
- Choose Source, 1:1, 4:5, 16:9 or 9:16 output ratios.
- Zoom and reposition the source without editing the original file.
- Export PNG files up to a 6,000 px long edge.
- Export video as WebM in supported browsers.
- Save and reload a JSON setup containing shapes, colors and controls.
- All user media is processed locally in the browser.

## Open on a Mac

1. Install the current Node.js LTS version.
2. Open Terminal in this folder.
3. Run `npm install` the first time only.
4. Run `npm run dev`.
5. Open the local address shown in Terminal, usually `http://localhost:5173`.

Stop the local site with `Control + C`.

## Recommended files

Transparent SVG or PNG graphics produce the cleanest shapes. Images with a solid rectangular background will use that rectangle as part of the shape mask.

For reliable WebM video export, use the latest version of Chrome and keep the tab open until playback reaches the end.

## Privacy

Uploaded media stays in the active browser session. A saved setup includes the custom shapes, colors and control values, but intentionally excludes the source photo or video.
