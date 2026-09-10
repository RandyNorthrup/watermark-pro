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
