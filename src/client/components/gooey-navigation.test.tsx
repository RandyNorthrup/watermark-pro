import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Film, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { GooeyNavigation } from './gooey-navigation'

const items = [
  {
    id: 'video',
    isCurrent: true,
    label: 'Videos',
    icon: Film,
    renderLink: (props: { className: string; children: ReactNode }) => (
      <a href="/app/video" {...props} />
    ),
  },
  {
    id: 'documents',
    isCurrent: false,
    label: 'Documents',
    icon: FileText,
    renderLink: (props: { className: string; children: ReactNode }) => (
      <a href="/app/documents" {...props} />
    ),
  },
]

describe('gooey navigation', () => {
  it('keeps destinations out of the tab order when collapsed and restores focus on Escape', async () => {
    const user = userEvent.setup()
    render(<GooeyNavigation items={items} label="Primary" />)
    expect(screen.queryByRole('link', { name: 'Videos' })).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      '/app/documents',
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('dismisses through the trigger and outside interaction and uses unique filter references', async () => {
    const user = userEvent.setup()
    render(
      <>
        <GooeyNavigation items={items} label="Primary" />
        <button>Tool action</button>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    await user.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('link', { name: 'Videos' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const filter = document.querySelector('filter')
    expect(filter?.id).toBeTruthy()
    expect(document.querySelector('.gooey-shapes')).toHaveStyle({
      filter: `url(#${filter?.id ?? ''})`,
    })
    await user.click(screen.getByRole('button', { name: 'Tool action' }))
    expect(screen.queryByRole('link', { name: 'Videos' })).toBeNull()
  })
  it('closes when the current destination is chosen without interrupting inactive routing', async () => {
    const user = userEvent.setup()
    render(<GooeyNavigation items={items} label="Primary" />)
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    await user.click(screen.getByRole('link', { name: 'Documents' }))
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Videos' }))
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  })
})
