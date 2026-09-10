#!/usr/bin/env node
/** Every build produces the deployable SPA/Worker and all static locale pages without a preview dependency. */
import path from 'node:path'

import { binOf, runNode } from './lib/cli.mjs'

const vite = binOf('vite', 'vite')
runNode('scripts/build-open-source.mjs')
runNode(vite, ['build'])
runNode(vite, ['build', '--config', 'vite.prerender.config.ts'])
runNode('scripts/prerender.mjs')
const artifactEnvironment = { LUMAFOIL_CLIENT_DIR: path.resolve('dist/client') }
runNode('--test', ['scripts/verify-built.test.mjs'], artifactEnvironment)
runNode('scripts/bundle-budget.mjs', [], artifactEnvironment)
runNode('scripts/publication-scan.mjs', ['--built'])
