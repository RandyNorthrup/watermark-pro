/** Record real chunk membership outside the served assets for matched bundle experiments. */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

const INVENTORY_DIRECTORY = path.join('dist', 'analysis')
const INVENTORY_FILENAME = 'client-modules.json'
const VIRTUAL_PREFIX = '\0'

function relativeModuleId(id: string): string {
  const isVirtual = id.startsWith(VIRTUAL_PREFIX)
  const source = isVirtual ? id.slice(VIRTUAL_PREFIX.length) : id
  const relative = path.isAbsolute(source) ? path.relative(process.cwd(), source) : source
  return `${isVirtual ? 'virtual:' : ''}${relative.replaceAll('\\', '/')}`
}

/** Observes final client chunks without changing their code, imports or emitted asset inventory. */
export function bundleInventoryPlugin(): Plugin {
  return {
    name: 'bundle-module-inventory',
    apply: 'build',
    writeBundle(_options, bundle) {
      if (bundle['index.html']?.type !== 'asset') return
      const chunks = Object.values(bundle)
        .filter((entry) => entry.type === 'chunk')
        .map((chunk) => ({
          file: chunk.fileName,
          isEntry: chunk.isEntry,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules)
            .map(([id, module]) => ({
              id: relativeModuleId(id),
              renderedLength: module.renderedLength,
            }))
            .toSorted((first, second) => first.id.localeCompare(second.id)),
        }))
        .toSorted((first, second) => first.file.localeCompare(second.file))
      mkdirSync(INVENTORY_DIRECTORY, { recursive: true })
      writeFileSync(
        path.join(INVENTORY_DIRECTORY, INVENTORY_FILENAME),
        JSON.stringify({ chunks }, null, 2) + '\n',
      )
    },
  }
}
