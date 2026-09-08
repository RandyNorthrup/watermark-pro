import { describe, expect, it } from 'vitest'

import { CancelledError } from './errors'

describe('CancelledError', () => {
  it('is an Error named CancelledError carrying a cancelled message', () => {
    const error = new CancelledError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('CancelledError')
    expect(error.message).toBe('cancelled')
  })
})
