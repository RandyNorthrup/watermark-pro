import assert from 'node:assert/strict'
import test from 'node:test'

import { lighthouseDiagnostics } from './lib/lighthouse-diagnostics.mjs'

test('retains finite causes while omitting page text, selectors, and private URLs', () => {
  const diagnostics = lighthouseDiagnostics({
    environment: { benchmarkIndex: 1234 },
    audits: {
      'layout-shifts': {
        details: {
          items: [
            {
              node: {
                lhId: 'page-5-DIV',
                path: '1,HTML,1,BODY,0,DIV',
                selector: '#private-account',
                snippet: '<div>private@example.test</div>',
                nodeLabel: 'private@example.test',
                boundingRect: { top: 1.2, bottom: 8.8, left: 2, right: 7, width: 5, height: 7.6 },
              },
              score: 0.125,
              subItems: { items: [{ cause: 'Web font loaded', extra: { value: '/secret' } }] },
            },
          ],
        },
      },
      'long-tasks': {
        details: {
          items: [
            {
              url: 'https://private.example.test/assets/index-Ab12.js?token=private',
              duration: 220.5,
              startTime: 100.25,
            },
          ],
        },
      },
      'bootup-time': {
        details: {
          items: [{ url: 'https://private.example.test/share/private-token', total: 80 }],
        },
      },
    },
  })

  assert.deepEqual(diagnostics, {
    benchmarkIndex: 1234,
    layoutShifts: [
      {
        score: 0.125,
        path: '1,HTML,1,BODY,0,DIV',
        nodeId: 'page-5-DIV',
        rectangle: { top: 1, bottom: 9, left: 2, right: 7, width: 5, height: 8 },
        cause: 'web-font',
      },
    ],
    longTasks: [{ source: 'asset:index-Ab12.js', duration: 220.5, startTime: 100.25 }],
    bootup: [{ source: 'document', duration: 80 }],
  })
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|secret|token|example\.test/)
})

test('rejects malformed diagnostic fields and classifies unknown causes', () => {
  const diagnostics = lighthouseDiagnostics({
    environment: { benchmarkIndex: NaN },
    audits: {
      'layout-shifts': {
        details: {
          items: [
            {
              node: { lhId: 'account-private', path: '1,HTML,email@example.test' },
              score: 0.01,
              subItems: { items: [{ cause: 'User content private@example.test' }] },
            },
            { score: Infinity },
          ],
        },
      },
      'long-tasks': { details: { items: [{ url: 'not a URL', duration: 55 }] } },
    },
  })

  assert.deepEqual(diagnostics, {
    benchmarkIndex: null,
    layoutShifts: [{ score: 0.01, cause: 'other' }],
    longTasks: [{ source: 'unknown', duration: 55 }],
    bootup: [],
  })
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|example\.test/)
})

const TRACE_ORIGIN = 'https://audit.example.test'
const BUILT_SOURCE = 'function start() {}\n  start()'
function traceTask({
  url = TRACE_ORIGIN + '/assets/entry.js',
  lineNumber = 2,
  columnNumber = 3,
  startTime = 10,
  duration = 100,
  selfTime = 80,
  name = 'FunctionCall',
  extra = {},
} = {}) {
  return {
    startTime,
    duration,
    selfTime,
    group: { id: name === 'v8.compile' ? 'scriptParseCompile' : 'scriptEvaluation' },
    event: {
      name,
      ph: 'X',
      ts: 10_000,
      dur: 100_000,
      args: {
        data: {
          url,
          lineNumber,
          columnNumber,
          scriptId: '7',
          functionName: 'private@example.test',
          ...extra,
        },
      },
    },
  }
}

function diagnosticsForTasks(tasks, assetSources = new Map([['/assets/entry.js', BUILT_SOURCE]])) {
  return lighthouseDiagnostics({}, { tasks, origin: TRACE_ORIGIN, assetSources }).execution
}

test('preserves the actual bootup scripting/parse split and verified generated callback coordinates', () => {
  const diagnostics = lighthouseDiagnostics(
    {
      audits: {
        'bootup-time': {
          details: {
            items: [
              {
                url: TRACE_ORIGIN + '/assets/entry.js',
                total: 220,
                scripting: 180,
                scriptParseCompile: 40,
              },
            ],
          },
        },
      },
    },
    {
      tasks: [traceTask()],
      origin: TRACE_ORIGIN,
      assetSources: new Map([['/assets/entry.js', BUILT_SOURCE]]),
    },
  )
  assert.deepEqual(diagnostics.bootup, [
    { source: 'asset:entry.js', duration: 220, scripting: 180, scriptParseCompile: 40 },
  ])
  assert.equal(diagnostics.execution.mapping, 'generated-build-only')
  assert.equal(diagnostics.execution.timingBasis, 'observed-main-thread')
  assert.deepEqual(diagnostics.execution.timings, [
    { group: 'scriptEvaluation', startMs: 10, inclusiveMs: 100, selfMs: 80 },
  ])
  const coordinate = diagnostics.execution.coordinates[0]
  assert.equal(coordinate.asset, 'entry.js')
  assert.equal(coordinate.line, 2)
  assert.equal(coordinate.column, 3)
  assert.match(coordinate.buildSha256, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /private|example\.test|functionName|function start/,
  )
})

test('missing, foreign, unknown-build and out-of-range frames retain timing without false source attribution', () => {
  const tasks = [
    traceTask({ url: undefined, lineNumber: undefined }),
    traceTask({ url: 'https://foreign.example.test/assets/entry.js' }),
    traceTask({ url: TRACE_ORIGIN + '/assets/unknown.js' }),
    traceTask({ columnNumber: 1000 }),
  ]
  // Explicitly absent payload data models the missing-field shape instead of a default argument.
  tasks[0].event.args.data = {}
  const execution = diagnosticsForTasks(tasks)
  assert.equal(execution.timings.length, tasks.length)
  assert.deepEqual(execution.coordinates, [])
  assert.equal(execution.foreignAttribution, 1)
  assert.equal(execution.missingAttribution, 3)
  assert.doesNotMatch(JSON.stringify(execution), /foreign\.example|unknown\.js|https?:\/\//)
})

test('rejects malformed times and bounds retained coordinates and timing records', () => {
  const tasks = [
    traceTask({ selfTime: NaN }),
    traceTask({ duration: Infinity }),
    traceTask({ selfTime: 101 }),
    ...Array.from({ length: 80 }, (_, i) => traceTask({ startTime: i })),
  ]
  const execution = diagnosticsForTasks(tasks)
  assert.equal(execution.timings.length, 64)
  assert.equal(execution.coordinates.length, 20)
  assert.equal(execution.timingsTruncated, true)
  assert.equal(execution.coordinatesDiscarded, 60)
  const absent = lighthouseDiagnostics(
    {},
    { origin: TRACE_ORIGIN, assetSources: new Map() },
  ).execution
  assert.equal(absent.available, false)
  assert.deepEqual(absent.timings, [])
  assert.deepEqual(absent.coordinates, [])
})

for (const name of ['EvaluateScript', 'v8.compile']) {
  test(name + ' retains its direct one-based generated coordinates', () => {
    const execution = diagnosticsForTasks([traceTask({ name })])
    assert.equal(execution.coordinates.length, 1)
    assert.equal(execution.coordinates[0].line, 2)
    assert.equal(execution.coordinates[0].column, 3)
    assert.equal(execution.coordinates[0].context, 'direct-event')
  })
}

for (const [name, lineNumber, columnNumber] of [
  ['FunctionCall', 2, 3],
  ['EvaluateScript', 1, 2],
  ['v8.compile', 1, 2],
]) {
  test(name + ' synchronous stack uses the installed trace-engine coordinate convention', () => {
    const task = traceTask({ name })
    task.event.args.data = {
      stackTrace: [
        {
          url: TRACE_ORIGIN + '/assets/entry.js',
          lineNumber,
          columnNumber,
          functionName: 'private',
          scriptId: '7',
        },
      ],
    }
    const execution = diagnosticsForTasks([task])
    assert.equal(execution.coordinates.length, 1)
    assert.equal(execution.coordinates[0].line, 2)
    assert.equal(execution.coordinates[0].column, 3)
    assert.equal(execution.coordinates[0].context, 'synchronous-stack')
    assert.doesNotMatch(JSON.stringify(execution), /private|scriptId/)
  })
}

test('FunctionCall stack zero coordinates remain zero-indexed under installed normalization', () => {
  const task = traceTask()
  task.event.args.data = {
    stackTrace: [{ url: TRACE_ORIGIN + '/assets/entry.js', lineNumber: 0, columnNumber: 0 }],
  }
  const execution = diagnosticsForTasks([task])
  assert.equal(execution.coordinates[0].line, 1)
  assert.equal(execution.coordinates[0].column, 1)
})

test('an exact coordinate cap discards nothing and a later valid point reports one discard', () => {
  const tasks = Array.from({ length: 20 }, () => traceTask())
  const exact = diagnosticsForTasks(tasks)
  assert.equal(exact.coordinates.length, 20)
  assert.equal(exact.coordinatesDiscarded, 0)
  tasks.push(traceTask())
  const exceeded = diagnosticsForTasks(tasks)
  assert.equal(exceeded.coordinates.length, 20)
  assert.equal(exceeded.coordinatesDiscarded, 1)
})

test('build-listed dependency and vendor chunks can supply generated coordinates', () => {
  const task = traceTask({ url: TRACE_ORIGIN + '/assets/vendor.js' })
  const execution = diagnosticsForTasks(
    [task],
    new Map([
      ['/assets/entry.js', BUILT_SOURCE],
      ['/assets/vendor.js', BUILT_SOURCE],
    ]),
  )
  assert.equal(execution.coordinates[0].asset, 'vendor.js')
  assert.equal(execution.coordinates[0].context, 'direct-event')
})

test('foreign direct code is not attributed to its first-party initiating stack', () => {
  const task = traceTask({
    url: 'https://foreign.example.test/assets/entry.js',
    extra: {
      stackTrace: [{ url: TRACE_ORIGIN + '/assets/entry.js', lineNumber: 2, columnNumber: 3 }],
    },
  })
  const execution = diagnosticsForTasks([task])
  assert.equal(execution.foreignAttribution, 1)
  assert.deepEqual(execution.coordinates, [])
})

test('direct zero coordinates are unavailable under the one-based event convention', () => {
  const execution = diagnosticsForTasks([traceTask({ lineNumber: 0, columnNumber: 0 })])
  assert.equal(execution.missingAttribution, 1)
  assert.deepEqual(execution.coordinates, [])
})
