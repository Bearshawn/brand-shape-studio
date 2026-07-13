# Replace the GitHub project with this Vercel-ready version

This folder is a clean Vite React version of Brand Shape Studio. It keeps the
same browser features but builds to `dist/`, which Vercel recognizes.

## Before copying these files

Open Terminal in the existing `Brand-Shape-Studio-Phase-3` folder and remove
the old Sites-only source while keeping the hidden `.git` folder:

```bash
rm -rf app build db drizzle examples scripts tests worker .openai .npmrc \
  next.config.ts postcss.config.mjs drizzle.config.ts eslint.config.mjs
```

Then copy every file and folder from this package into the existing project
folder and choose **Replace** when macOS asks.

In GitHub Desktop, commit the changes with the summary:

```text
Make Brand Shape Studio Vercel-ready
```

Push the commit. Vercel should redeploy automatically. In Vercel project
settings, the Framework Preset should read **Vite** and Output Directory should
be `dist` (normally both are detected from `vercel.json`).
