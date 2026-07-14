# Brand Shape Studio

## Version 1.1

- Compare the generated composition with the original source from the canvas toolbar.
- Undo up to 10 visual operations.
- Quick-save still images as PNG and video compositions as WebM.
- Use up to 200 columns.
- Export static compositions as SVG.

## Version 1.2

- Export compact Illustrator-compatible SVGs using reusable vector symbols.
- Keep the left upload panel and canvas fixed while the long right control panel scrolls independently on desktop.

## Version 1.2.1

- Add SVG 1.1 and legacy `xlink:href` references alongside modern `href` references for broader Adobe Illustrator compatibility.

Vercel-ready Vite React version of Brand Shape Studio.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production files are generated in `dist/`. Vercel detects the included
Vite configuration automatically.
