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
  it.each(['=1+1', '+SUM(1;2)', '-1+2', '@SUM(1)', ' \t=1+1', '\t1+1', '\r=1+1', '＝1+1'])(
    'exports spreadsheet-like source names as literal text: %j',
    (source) => {
      const csv = buildReportCsv([{ ...BASE, source }])
      expect(csv).toContain(`\n"'${source}",trip/one.jpg,`)
      expect(csv).not.toContain(`\n${source},`)
    },
  )
  it('protects every external text column while retaining ordinary names and numeric cells', () => {
    const csv = buildReportCsv([
      { ...BASE, relativePath: '=1+1', output: '+1+1', error: '@SUM(1)', presets: '-1+1' },
      { ...BASE, source: '2026-09-12.jpg', relativePath: 'mail@studio/photo=proof.jpg' },
    ])
    expect(csv.split('\n', 2)[1]).toBe(
      'one.jpg,"\'=1+1","\'+1+1",done,1200,900,42,"\'@SUM(1)","\'-1+1",no',
    )
    expect(csv.split('\n', 3)[2]).toBe(
      '2026-09-12.jpg,mail@studio/photo=proof.jpg,one-watermarked.jpg,done,1200,900,42,,Studio,no',
    )
  })
  it('keeps quote and alternate-separator payloads inside one field', () => {
    const csv = buildReportCsv([{ ...BASE, source: 'photo;=1+1', error: '=SUM("1","2")' }])
    expect(csv.split('\n', 2)[1]).toContain('"photo;=1+1",')
    expect(csv.split('\n', 2)[1]).toContain('"\'=SUM(""1"",""2"")"')
  })
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
