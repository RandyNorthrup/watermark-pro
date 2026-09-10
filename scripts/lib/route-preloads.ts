/** Build-time resource hints retain route boundaries and execute no application code. */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'
import { z } from 'zod/mini'

const APP_SOURCE = 'src/client/routes/app/'
const SPLIT_SOURCE = /^(.+)\.tsx\?tsr-split=(component|loader)$/
const ROUTE_SEGMENT = /^\$?[A-Za-z0-9-]+$/
const ASSET_FILE = /^assets\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/
const COMMON_ENTRIES = [
  'src/client/lib/app-bootstrap.ts',
  'src/client/routes/app/route.tsx?tsr-split=component',
  'src/client/routes/app/route.tsx?tsr-split=loader',
]
const RESOURCE_MAP_ID = 'app-route-preloads'

const optionalImports = z.optional(z.array(z.string()))
const chunkSchema = z.object({
  file: z.string(),
  src: z.optional(z.string()),
  imports: optionalImports,
  isEntry: z.optional(z.boolean()),
})
const manifestSchema = z.record(z.string(), chunkSchema)
type Manifest = z.infer<typeof manifestSchema>

interface RouteResources {
  pattern: string
  rank: string
  sources: string[]
}
interface PreloadPlan {
  common: string[]
  routes: [string, string[]][]
}

/** Refuse missing imports and unsafe resource URLs instead of emitting broken hints. */
function staticFiles(manifest: Manifest, starts: readonly string[]): Set<string> {
  const visited = new Set<string>()
  const files = new Set<string>()
  function visit(key: string): void {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (chunk === undefined) throw new Error('Missing preload manifest entry: ' + key)
    if (
      !ASSET_FILE.test(chunk.file) ||
      chunk.file.split('/').some((part) => part === '.' || part === '..')
    )
      throw new Error('Unsafe preload asset path: ' + chunk.file)
    if (chunk.file.endsWith('.js')) files.add('/' + chunk.file)
    const dependencies = chunk.imports ?? []
    for (const dependency of dependencies) visit(dependency)
  }
  for (const start of starts) visit(start)
  return files
}

function routeShape(relativeSource: string): { pattern: string; rank: string } {
  const parts = relativeSource.split('/')
  if (parts.at(-1) === 'index') parts.pop()
  if (parts.some((part) => !ROUTE_SEGMENT.test(part) || part === 'route'))
    throw new Error('Review unsupported app preload route shape: ' + relativeSource)
  const suffix = parts.map((part) => (part.startsWith('$') ? '[^/]+' : part)).join('/')
  return {
    pattern: '^/app' + (suffix === '' ? '' : '/' + suffix) + '/?$',
    rank: parts.map((part) => (part.startsWith('$') ? '0' : '1')).join(''),
  }
}

function sortedFiles(files: Set<string>): string[] {
  return files
    .values()
    .toArray()
    .toSorted((first, second) => first.localeCompare(second))
}

/** Select real static dependencies; the routing map contains data, never application code. */
export function createPreloadPlan(value: unknown): PreloadPlan {
  const manifest = manifestSchema.parse(value)
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry === true)
  if (entries.length !== 1 || entries[0] === undefined)
    throw new Error('Preload inventory requires exactly one application entry.')
  const bootFiles = staticFiles(manifest, [entries[0][0]])
  const common = staticFiles(manifest, COMMON_ENTRIES).difference(bootFiles)
  const routes = new Map<string, RouteResources>()
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.src?.startsWith(APP_SOURCE) !== true) continue
    const split = SPLIT_SOURCE.exec(chunk.src.slice(APP_SOURCE.length))
    const relativeSource = split?.[1]
    if (relativeSource === undefined || relativeSource === 'route') continue
    const shape = routeShape(relativeSource)
    const previous = routes.get(shape.pattern)
    if (previous === undefined) routes.set(shape.pattern, { ...shape, sources: [key] })
    else previous.sources.push(key)
  }
  if (!routes.values().some((route) => route.pattern === '^/app/?$'))
    throw new Error('The dashboard preload route is missing.')
  return {
    common: sortedFiles(common),
    routes: routes
      .values()
      .toArray()
      .toSorted((first, second) => second.rank.localeCompare(first.rank))
      .map((route): [string, string[]] => [
        route.pattern,
        sortedFiles(staticFiles(manifest, route.sources).difference(bootFiles).difference(common)),
      ]),
  }
}

/**
 * Only append resource hints; native modulepreload does not execute modules.
 * Build-time sets already make the common and route arrays unique and disjoint.
 */
export const PRELOAD_CONTROLLER =
  String.raw`(()=>{if(!/^\/app(?:\/|$)/.test(location.pathname))return;` +
  'const n=document.getElementById("' +
  RESOURCE_MAP_ID +
  '");' +
  'if(!n)throw Error("Route preload map is unavailable.");' +
  'const p=JSON.parse(n.innerHTML),r=p.routes.find(r=>new RegExp(r[0]).test(location.pathname));' +
  'if(!r)return;for(const h of p.common.concat(r[1])){' +
  'const l=document.createElement("link");l.rel="modulepreload";l.href=h;l.crossOrigin="";' +
  'document.head.append(l)}})()'

/** Discover app dependencies before blocking CSS, while keeping encoding metadata first. */
export function insertAppPreloads(source: string, plan: PreloadPlan): string {
  const headStart = source.indexOf('<head>')
  const headEnd = source.indexOf('</head>')
  const stylesheet = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i.exec(source)
  const charset = /<meta\b[^>]*\bcharset=["'][^"']+["'][^>]*>/i.exec(source)
  if (
    headStart === -1 ||
    stylesheet === null ||
    charset === null ||
    headEnd <= headStart ||
    charset.index <= headStart ||
    charset.index >= stylesheet.index ||
    stylesheet.index >= headEnd
  )
    throw new Error(
      'Application preloads require charset metadata before a stylesheet in the head.',
    )
  const resources =
    '<template id="' +
    RESOURCE_MAP_ID +
    '" data-app-preload>' +
    JSON.stringify(plan) +
    '</template><script data-app-preload>' +
    PRELOAD_CONTROLLER +
    '</script>'
  return source.slice(0, stylesheet.index) + resources + source.slice(stylesheet.index)
}

/** Runs before the existing inline CSP hash and final offline-inventory byte hashing. */
export function routePreloadPlugin(): Plugin {
  return {
    name: 'app-route-preloads',
    apply: 'build',
    writeBundle(options, bundle) {
      const html = bundle['index.html']
      if (html?.type !== 'asset') return
      const directory = options.dir ?? path.join('dist', 'client')
      const raw: unknown = JSON.parse(
        readFileSync(path.join(directory, '.vite', 'manifest.json'), 'utf8'),
      )
      const plan = createPreloadPlan(raw)
      const source =
        typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8')
      html.source = insertAppPreloads(source, plan)
      writeFileSync(path.join(directory, 'index.html'), html.source)
    },
  }
}
