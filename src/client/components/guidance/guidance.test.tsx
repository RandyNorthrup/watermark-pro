import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FirstUseGuidance } from './first-use-guidance'
import { GuidanceCard } from './guidance-card'
import { GuidanceQueue } from './guidance-queue'
import { ACCOUNT_ID_HEADER } from '../../../shared/account-identity'
import { setOfflineUser } from '../../lib/offline-context'

afterEach(() => {
  vi.unstubAllGlobals()
  setOfflineUser(null)
})

describe('single contextual guidance queue', () => {
  it('waits offline, serializes topics, pauses under menus, and never redisplays a consumed topic', async () => {
    const claim = vi.fn().mockResolvedValue(true)
    const queue = new GuidanceQueue(claim)
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)
    queue.enqueue('image', null)
    queue.enqueue('export', null)
    queue.enqueue('export', null)
    queue.setBlocked(false)
    expect(claim).not.toHaveBeenCalled()
    queue.setOnline(true)
    await waitFor(() => expect(queue.getSnapshot().active?.topic).toBe('image'))
    expect(claim).toHaveBeenCalledTimes(1)
    queue.setBlocked(true)
    queue.dismiss()
    expect(claim).toHaveBeenCalledTimes(1)
    queue.setBlocked(false)
    await waitFor(() => expect(queue.getSnapshot().active?.topic).toBe('export'))
    queue.dismiss()
    queue.enqueue('image', null)
    expect(queue.getSnapshot().active).toBeNull()
    expect(claim).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    queue.dispose()
    queue.enqueue('gallery', null)
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('retries a failed claim on reconnect, skips previously claimed tips, and fences old account results', async () => {
    const pending = Promise.withResolvers<boolean>()
    const claim = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(false)
      .mockReturnValueOnce(pending.promise)
    const queue = new GuidanceQueue(claim)
    queue.activate()
    queue.setBlocked(false)
    queue.setOnline(true)
    queue.enqueue('image', null)
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1))
    expect(queue.getSnapshot().active).toBeNull()
    queue.setOnline(true)
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(2))
    expect(queue.getSnapshot().active).toBeNull()
    queue.enqueue('export', null)
    queue.dispose()
    pending.resolve(true)
    await pending.promise
    expect(queue.getSnapshot().active).toBeNull()
  })
})

describe('first-use cards', () => {
  it('survives Strict Mode rehearsal without consuming a tip before display', async () => {
    setOfflineUser('guide-account')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ claimed: true })))
    vi.stubGlobal('fetch', fetch)
    render(
      <StrictMode>
        <FirstUseGuidance userId="guide-account" pathname="/app/editor" />
      </StrictMode>,
    )
    await screen.findByRole('dialog', { name: 'Image' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('supports accessible paging, swipes, vertical-scroll rejection, and explicit permanent dismissal', async () => {
    const user = userEvent.setup()
    const dismiss = vi.fn()
    render(<GuidanceCard item={{ topic: 'image', anchor: null }} onDismiss={dismiss} />)
    const dialog = await screen.findByRole('dialog', { name: 'Image' })
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/original image/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    const send = (name: string, x: number, y: number, id = 1) => {
      const event = new MouseEvent(name, { bubbles: true, clientX: x, clientY: y })
      Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id } })
      fireEvent(dialog, event)
    }
    send('pointerdown', 100, 100)
    send('pointerup', 90, 10)
    expect(screen.getByText(/original file stays untouched/)).toBeInTheDocument()
    send('pointerdown', 200, 100)
    send('pointerup', 100, 100)
    expect(screen.getByText(/original image/)).toBeInTheDocument()
    send('pointerdown', 100, 100)
    send('pointerup', 200, 100)
    expect(screen.getByText(/original file stays untouched/)).toBeInTheDocument()
    send('pointerdown', 200, 100)
    send('pointercancel', 100, 100)
    send('pointerup', 100, 100)
    expect(screen.getByText(/original file stays untouched/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Got It' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Dismiss Tip' }))
    expect(dismiss).toHaveBeenCalledTimes(2)
  })

  it('binds requests to the account and shows one tip while pausing for dialogs and menus', async () => {
    setOfflineUser('guide-account')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ claimed: true })))
    vi.stubGlobal('fetch', fetch)
    render(
      <>
        <button data-guidance-topic="export">Export Tool</button>
        <FirstUseGuidance userId="guide-account" pathname="/app/editor" />
      </>,
    )
    await screen.findByRole('dialog', { name: 'Image' })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(
      'guide-account',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Export Tool' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    const blocker = document.createElement('div')
    blocker.setAttribute('role', 'menu')
    act(() => {
      document.body.append(blocker)
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Image' })).not.toBeInTheDocument(),
    )
    act(() => {
      blocker.remove()
    })
    await screen.findByRole('dialog', { name: 'Image' })
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Tip' }))
    await screen.findByRole('dialog', { name: 'Save Your Result' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Tip' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export Tool' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('never claims a new account tip from the old mounted account, or shows a late old-account response', async () => {
    setOfflineUser('guide-account')
    const response = Promise.withResolvers<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise)
    vi.stubGlobal('fetch', fetch)
    render(
      <>
        <button data-guidance-topic="export">Export Tool</button>
        <FirstUseGuidance userId="guide-account" pathname="/app/editor" />
      </>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    setOfflineUser('new-account')
    await act(async () => {
      response.resolve(Response.json({ claimed: true }))
      await response.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Export Tool' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('drops a late tip from the old page and shows only the current route', async () => {
    setOfflineUser('guide-account')
    const response = Promise.withResolvers<Response>()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(response.promise)
      .mockImplementation(() => Promise.resolve(Response.json({ claimed: true })))
    vi.stubGlobal('fetch', fetch)
    const view = render(<FirstUseGuidance userId="guide-account" pathname="/app/editor" />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    view.rerender(<FirstUseGuidance userId="guide-account" pathname="/app/gallery" />)
    await act(async () => {
      response.resolve(Response.json({ claimed: true }))
      await response.promise
    })
    await screen.findByRole('dialog', { name: 'Your Gallery' })
    expect(screen.queryByRole('dialog', { name: 'Image' })).not.toBeInTheDocument()
  })
})
