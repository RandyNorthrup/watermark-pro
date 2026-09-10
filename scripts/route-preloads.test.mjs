/** Independent route/resource fixtures prove early hints retain lazy and public boundaries. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

import { createPreloadPlan, insertAppPreloads, PRELOAD_CONTROLLER } from './lib/route-preloads.ts'

const PREFIX = 'src/client/routes/app/'
const BOOTSTRAP = 'src/client/lib/app-bootstrap.ts'

function fixture() {
  const manifest = {
    entry: { file: 'assets/entry.js', isEntry: true, imports: ['runtime'] },
    runtime: { file: 'assets/runtime.js' },
    auth: { file: 'assets/auth.js', imports: ['runtime'] },
    common: { file: 'assets/common.js' },
    form: { file: 'assets/form.js' },
    video: { file: 'assets/video.js' },
    [BOOTSTRAP]: { file: 'assets/bootstrap.js', imports: ['auth'] },
  }
  function route(source, component, loader, imports = []) {
    const componentKey = PREFIX + source + '.tsx?tsr-split=component'
    const loaderKey = PREFIX + source + '.tsx?tsr-split=loader'
    manifest[componentKey] = {
      file: 'assets/' + component + '.js',
      src: componentKey,
      imports,
      dynamicImports: ['video'],
    }
    manifest[loaderKey] = {
      file: 'assets/' + loader + '.js',
      src: loaderKey,
      imports: ['auth'],
    }
  }
  route('route', 'layout', 'layout-loader', ['common'])
  route('index', 'dashboard', 'dashboard-loader', ['common'])
  route('library/new', 'new', 'new-loader', ['form'])
  route('library/$watermarkId', 'edit', 'edit-loader', ['form'])
  return manifest
}

function linksFor(plan, pathname) {
  const dom = new JSDOM(
    '<template id="app-route-preloads">' +
      JSON.stringify(plan) +
      '</template><script>' +
      PRELOAD_CONTROLLER +
      '</script>',
    { url: 'https://lumafoil.example' + pathname, runScripts: 'dangerously' },
  )
  return [...dom.window.document.querySelectorAll('link')]
    .map((link) => {
      assert.equal(link.rel, 'modulepreload')
      assert.equal(link.crossOrigin, '')
      return new URL(link.href).pathname
    })
    .toSorted((first, second) => first.localeCompare(second))
}

test('app hints follow charset metadata and execute before the first blocking stylesheet', () => {
  const source =
    '<!doctype html><html><head><meta charset="UTF-8"><title>App</title>' +
    '<link rel="stylesheet" href="/assets/first.css">' +
    '<link rel="stylesheet" href="/assets/second.css"></head><body></body></html>'
  const plan = createPreloadPlan(fixture())
  const output = insertAppPreloads(source, plan)
  const dom = new JSDOM(output)
  const { document } = dom.window
  const controller = document.querySelector('script[data-app-preload]')
  const charset = document.querySelector('meta[charset]')
  const stylesheet = document.querySelector('link[rel="stylesheet"]')
  assert.ok(controller)
  assert.ok(charset)
  assert.ok(stylesheet)
  assert.equal(controller.textContent, PRELOAD_CONTROLLER)
  assert.equal(
    charset.compareDocumentPosition(controller),
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  )
  assert.equal(
    controller.compareDocumentPosition(stylesheet),
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'PRELOAD_ORDER: controller must not wait for the blocking stylesheet',
  )
  assert.deepEqual(
    JSON.parse(document.querySelector('template').content.textContent),
    plan,
    'Placement must preserve the exact validated resource map',
  )
  dom.window.close()
  for (const invalid of [
    '<head><meta charset="UTF-8"></head>',
    '<head><link rel="stylesheet" href="/a.css"><meta charset="UTF-8"></head>',
    '<head></head><body><meta charset="UTF-8"><link rel="stylesheet" href="/a.css"></body>',
  ])
    assert.throws(() => insertAppPreloads(invalid, plan), /charset metadata before a stylesheet/)
})

test('preloads static bootstrap/layout and exact component/loader without executing lazy branches', () => {
  const plan = createPreloadPlan(fixture())
  const common = [
    '/assets/auth.js',
    '/assets/bootstrap.js',
    '/assets/common.js',
    '/assets/layout-loader.js',
    '/assets/layout.js',
  ]
  for (const pathname of ['/app', '/app/'])
    assert.deepEqual(
      linksFor(plan, pathname),
      [...common, '/assets/dashboard-loader.js', '/assets/dashboard.js'].toSorted((first, second) =>
        first.localeCompare(second),
      ),
    )
  for (const pathname of ['/app/library/new', '/app/library/new/'])
    assert.deepEqual(
      linksFor(plan, pathname),
      [...common, '/assets/form.js', '/assets/new-loader.js', '/assets/new.js'].toSorted(
        (first, second) => first.localeCompare(second),
      ),
    )
  assert.deepEqual(
    linksFor(plan, '/app/library/a-preset'),
    [...common, '/assets/edit-loader.js', '/assets/edit.js', '/assets/form.js'].toSorted(
      (first, second) => first.localeCompare(second),
    ),
  )
  assert.doesNotMatch(PRELOAD_CONTROLLER, /\b(?:eval|import)\s*\(/)
  assert.equal(linksFor(plan, '/app').includes('/assets/video.js'), false)
  assert.equal(linksFor(plan, '/app').includes('/assets/entry.js'), false)
})

test('public, auth, unknown and nonmatching paths get no app resource requests', () => {
  const plan = createPreloadPlan(fixture())
  for (const pathname of [
    '/',
    '/login',
    '/signup',
    '/privacy',
    '/terms',
    '/application',
    '/app/no-such-route',
    '/app/library',
    '/app/library/new/extra',
    '/app//',
  ])
    assert.deepEqual(linksFor(plan, pathname), [], pathname)
})

test('missing dependencies, ambiguous entries and unsafe resource paths fail the build plan', () => {
  const missing = fixture()
  delete missing.auth
  assert.throws(() => createPreloadPlan(missing), /Missing preload manifest entry: auth/)
  for (const file of [
    'https://outside.example/x.js',
    '../outside.js',
    'assets/../outside.js',
    'assets/</template>.js',
    'assets/a&b.js',
  ]) {
    const unsafe = fixture()
    unsafe.auth.file = file
    assert.throws(() => createPreloadPlan(unsafe), /Unsafe preload asset path/)
  }
  const multiple = fixture()
  multiple.other = { file: 'assets/other.js', isEntry: true }
  assert.throws(() => createPreloadPlan(multiple), /exactly one application entry/)
  const noDashboard = fixture()
  assert.equal(Reflect.deleteProperty(noDashboard, PREFIX + 'index.tsx?tsr-split=component'), true)
  assert.equal(Reflect.deleteProperty(noDashboard, PREFIX + 'index.tsx?tsr-split=loader'), true)
  assert.throws(() => createPreloadPlan(noDashboard), /dashboard preload route is missing/)
})
