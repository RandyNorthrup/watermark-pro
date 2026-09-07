import { describe, expect, it } from 'vitest'

import { buildReportCsv, type ReportRow } from './report'

const BASE: ReportRow = {
  source: 'one.jpg',
  relativePath: 'trip/one.jpg',
  output: 'one-watermarked.jpg',
  status: 'done',
  width: 1200,
  height: 900,
  durationMs: 42,
  error: null,
  presets: 'Studio',
  override: false,
}

describe('buildReportCsv', () => {
  it('writes a header and one row per job', () => {
    const csv = buildReportCsv([BASE, { ...BASE, override: true }])
    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'source,relative_path,output,status,width,height,duration_ms,error,presets,override',
    )
    expect(lines[1]).toBe('one.jpg,trip/one.jpg,one-watermarked.jpg,done,1200,900,42,,Studio,no')
    expect(lines[2]?.endsWith(',yes')).toBe(true)
  })

  it('quotes fields with commas, quotes and newlines and leaves numbers blank when null', () => {
    const row: ReportRow = {
      ...BASE,
      status: 'failed',
      width: null,
      height: null,
      durationMs: null,
      error: 'decode failed: bad, "corrupt"\nEOF',
    }
    const line = buildReportCsv([row]).split('\n').slice(1).join('\n')
    expect(line).toContain('failed,,,,')
    expect(line).toContain('"decode failed: bad, ""corrupt""\nEOF"')
  })
})
