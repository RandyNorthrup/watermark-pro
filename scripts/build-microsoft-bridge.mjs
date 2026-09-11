/** Bundle the official MSAL bridge separately from the application and its offline cache. */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

/** An explicit output supports isolated protocol tests without changing the shared build. */
export async function buildMicrosoftBridge(outDir = path.resolve('dist/client/oauth')) {
  return await build({
    configFile: false,
    root: path.resolve('src/client/oauth'),
    publicDir: false,
    base: '/oauth/',
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: false,
      license: { fileName: 'microsoft-bridge.LICENSE.txt' },
      rolldownOptions: {
        input: path.resolve('src/client/oauth/microsoft.html'),
        output: {
          entryFileNames: 'microsoft-bridge.js',
          postBanner: '/*! /oauth/microsoft-bridge.LICENSE.txt */',
        },
      },
    },
  })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildMicrosoftBridge()
