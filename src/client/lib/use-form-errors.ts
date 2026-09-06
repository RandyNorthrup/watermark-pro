import { useState } from 'react'
import type { ZodType } from 'zod'

/**
 * Tiny form helper: validates a values object with a Zod schema and keeps
 * per-field messages. Keeps forms in plain controlled state without a
 * form library.
 */
export function useFormErrors<T extends Record<string, unknown>>() {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})

  function validate(schema: ZodType<T>, values: unknown): T | null {
    const result = schema.safeParse(values)
    if (result.success) {
      setErrors({})
      return result.data
    }
    const next: Partial<Record<keyof T, string>> = {}
    for (const issue of result.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && next[key as keyof T] === undefined) {
        next[key as keyof T] = issue.message
      }
    }
    setErrors(next)
    return null
  }

  return {
    errors,
    validate,
    clear: () => {
      setErrors({})
    },
  }
}
