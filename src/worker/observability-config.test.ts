import { readFileSync } from 'node:fs'

import { parseConfigFileTextToJson } from 'typescript'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const environmentSchema = z.object({ observability: z.unknown() })
const configurationSchema = z.object({
  observability: z.unknown(),
  env: z.record(z.string(), environmentSchema),
})
const source = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
const parsed = parseConfigFileTextToJson('wrangler.jsonc', source)
if (parsed.error !== undefined) throw new Error('Wrangler configuration did not parse.')
const configuration = configurationSchema.parse(parsed.config)

describe('platform request-metadata privacy', () => {
  it.each(['default', 'production'])('%s deployment cannot persist bearer URL metadata', (name) => {
    const observability =
      name === 'default' ? configuration.observability : configuration.env[name]?.observability
    expect(observability).toEqual({
      enabled: false,
      redact_query_string: true,
      logs: { enabled: false, invocation_logs: false, persist: false },
      traces: { enabled: false, persist: false },
    })
  })
})
