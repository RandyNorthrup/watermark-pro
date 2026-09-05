import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HealthBadge } from './health-badge'

describe('HealthBadge', () => {
  it('announces the API status and environment as a live region', () => {
    render(<HealthBadge health={{ status: 'ok', environment: 'staging' }} />)

    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent('API ok')
    expect(badge).toHaveTextContent('staging')
  })
})
