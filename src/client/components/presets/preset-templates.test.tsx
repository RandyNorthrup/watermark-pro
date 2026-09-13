import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { PresetTemplates } from './preset-templates'
import { watermarkSpecSchema } from '../../../shared/watermark'
import { WATERMARK_TEMPLATES, watermarkTemplate } from '../../../shared/watermark-templates'

it('offers valid, distinct editable templates without creating workspace records', async () => {
  expect(new Set(WATERMARK_TEMPLATES.map((entry) => entry.id)).size).toBe(18)
  for (const template of WATERMARK_TEMPLATES)
    expect(watermarkSpecSchema.safeParse(template.spec).success).toBe(true)
  expect(watermarkTemplate('confidential')?.spec.text).toBe('CONFIDENTIAL')
  expect(watermarkTemplate('unknown')).toBeUndefined()
  const choose = vi.fn()
  const user = userEvent.setup()
  render(<PresetTemplates onChoose={choose} />)
  await user.type(screen.getByRole('searchbox', { name: 'Search Templates' }), 'confidential')
  expect(screen.queryByRole('button', { name: 'Use Draft' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Use Confidential' }))
  expect(choose).toHaveBeenCalledWith(watermarkTemplate('confidential'))
  await user.click(screen.getByRole('radio', { name: 'Photos' }))
  expect(screen.getByRole('status')).toHaveTextContent('No matching templates.')
  await user.clear(screen.getByRole('searchbox'))
  expect(screen.getByRole('button', { name: 'Use Photo Credit' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Use Draft' })).not.toBeInTheDocument()
})
