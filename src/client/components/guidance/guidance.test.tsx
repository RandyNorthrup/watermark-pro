import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FirstUseGuidance } from './first-use-guidance'
import { GuidanceCard } from './guidance-card'
import { GuidanceQueue } from './guidance-queue'
import { PRODUCT_TOUR_STEPS, requestProductTour } from './product-tour'
import { ACCOUNT_ID_HEADER } from '../../../shared/account-identity'
import { setOfflineUser } from '../../lib/offline-context'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

const USER_ID = 'guide-account'
const WORKSPACE_ID = 'guide-workspace'
const defaultProps = { userId: USER_ID, workspaceId: WORKSPACE_ID, pathname: '/app/editor' }

function mockClaims(isClaimed = true) {
  setOfflineUser(USER_ID)
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() => Promise.resolve(Response.json({ claimed: isClaimed })))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  navigate.mockReset().mockResolvedValue(undefined)
  setOfflineUser(null)
})

describe('per-account invitation queue', () => {
  it('waits offline and behind menus, atomically claims once, and never repeats a consumed invitation', async () => {
    const claim = vi.fn().mockResolvedValue(true)
    const queue = new GuidanceQueue(claim)
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)
    queue.enqueue('tour')
    queue.enqueue('tour')
    queue.setBlocked(false)
    expect(claim).not.toHaveBeenCalled()
    queue.setBlocked(true)
    queue.setOnline(true)
    expect(claim).not.toHaveBeenCalled()
    queue.setBlocked(false)
    await waitFor(() => expect(queue.getSnapshot().active?.topic).toBe('tour'))
    queue.dismiss()
    queue.enqueue('tour')
    expect(queue.getSnapshot().active).toBeNull()
    expect(claim).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    queue.dispose()
    queue.enqueue('tour')
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('retries a failed claim on reconnect and ignores a previously saved choice', async () => {
    const claim = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValue(false)
    const queue = new GuidanceQueue(claim)
    queue.activate()
    queue.setBlocked(false)
    queue.setOnline(true)
    queue.enqueue('tour')
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1))
    expect(queue.getSnapshot().active).toBeNull()
    queue.setOnline(true)
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(2))
    expect(queue.getSnapshot().active).toBeNull()
    queue.dispose()
  })
})

describe('opt-in product tour', () => {
  it('retains an explicit replay click before the lazy controller mounts and delivers it only once', async () => {
    mockClaims(false)
    requestProductTour(USER_ID, WORKSPACE_ID)
    const view = render(
      <StrictMode>
        <FirstUseGuidance {...defaultProps} pathname="/app/account" />
      </StrictMode>,
    )
    await screen.findByRole('dialog', { name: 'Images' })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ to: '/app/editor' })
    view.unmount()
    render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('discards a pending replay when account generation changes before the controller mounts', async () => {
    const fetch = mockClaims(false)
    requestProductTour(USER_ID, WORKSPACE_ID)
    setOfflineUser(null)
    setOfflineUser(USER_ID)
    render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('discards a pending replay when a different workspace mounts before delivery', async () => {
    const fetch = mockClaims(false)
    requestProductTour(USER_ID, 'previous-workspace')
    render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers once under Strict Mode and never navigates or opens tools before consent', async () => {
    const fetch = mockClaims()
    const tool = vi.fn()
    render(
      <StrictMode>
        <button data-guidance-topic="watermark" onClick={tool}>
          Watermark
        </button>
        <FirstUseGuidance {...defaultProps} />
      </StrictMode>,
    )
    await screen.findByRole('dialog', { name: 'Take A Quick Tour?' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ topic: 'tour' }))
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(USER_ID)
    expect(navigate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'No Thanks' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Watermark' }))
    expect(tool).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not reoffer on a fresh device after a saved choice; explicit replay remains available', async () => {
    const fetch = mockClaims(false)
    render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => requestProductTour('foreign-account', WORKSPACE_ID))
    expect(navigate).not.toHaveBeenCalled()
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    await screen.findByRole('dialog', { name: 'Images' })
    expect(navigate).toHaveBeenCalledWith({ to: '/app/editor' })
    await userEvent.click(screen.getByRole('button', { name: 'Exit Tour' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    await screen.findByRole('dialog', { name: 'Images' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('visits every main feature, opens only safe tools, supports back and ends without writing content', async () => {
    const fetch = mockClaims()
    const tools = new Map(
      ['watermark', 'presets', 'saved', 'crop', 'export'].map((tool) => [tool, vi.fn()]),
    )
    render(
      <>
        {[...tools].map(([tool, click]) => (
          <button key={tool} role="tab" data-guidance-topic={tool} onClick={click}>
            {tool}
          </button>
        ))}
        <FirstUseGuidance {...defaultProps} />
      </>,
    )
    await screen.findByRole('dialog', { name: 'Take A Quick Tour?' })
    await userEvent.click(screen.getByRole('button', { name: 'Start Tour' }))
    await screen.findByRole('dialog', { name: 'Images' })
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('dialog', { name: 'Create A Watermark' })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('dialog', { name: 'Images' })
    for (let index = 1; index < PRODUCT_TOUR_STEPS.length; index += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText(`Step ${String(index + 1)} Of ${String(PRODUCT_TOUR_STEPS.length)}`)
    }
    for (const route of [
      '/app/documents',
      '/app/video',
      '/app/bulk',
      '/app/library',
      '/app/gallery',
      '/app/account',
    ]) {
      expect(navigate).toHaveBeenCalledWith({ to: route })
    }
    for (const click of tools.values()) expect(click).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps one card and pauses behind conflicting dialogs without restarting', async () => {
    mockClaims()
    render(<FirstUseGuidance {...defaultProps} />)
    await screen.findByRole('dialog', { name: 'Take A Quick Tour?' })
    await userEvent.click(screen.getByRole('button', { name: 'Start Tour' }))
    const blocker = document.createElement('div')
    blocker.setAttribute('role', 'menu')
    act(() => document.body.append(blocker))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    act(() => blocker.remove())
    await screen.findByRole('dialog', { name: 'Images' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fences late claims after account changes and ignores subsequent replay from the former user', async () => {
    setOfflineUser(USER_ID)
    const response = Promise.withResolvers<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise)
    vi.stubGlobal('fetch', fetch)
    render(<FirstUseGuidance {...defaultProps} />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    setOfflineUser('new-account')
    await act(async () => {
      response.resolve(Response.json({ claimed: true }))
      await response.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exits on workspace switches and refuses to revive a late navigation', async () => {
    mockClaims(false)
    const navigation = Promise.withResolvers<undefined>()
    navigate.mockReturnValue(navigation.promise)
    const view = render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    await screen.findByRole('dialog', { name: 'Images' })
    view.rerender(
      <FirstUseGuidance {...defaultProps} workspaceId="other-workspace" pathname="/app/account" />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      navigation.resolve(undefined)
      await navigation.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports failed navigation and still lets the user quit while a retry is pending', async () => {
    mockClaims(false)
    navigate.mockRejectedValueOnce(new Error('Navigation failed'))
    render(<FirstUseGuidance {...defaultProps} pathname="/app/account" />)
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Exit Tour' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const navigation = Promise.withResolvers<undefined>()
    navigate.mockReturnValue(navigation.promise)
    act(() => requestProductTour(USER_ID, WORKSPACE_ID))
    await screen.findByRole('dialog', { name: 'Images' })
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Exit Tour' }))
    await act(async () => {
      navigation.resolve(undefined)
      await navigation.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('supports swipe and keyboard paging, rejects vertical/cancelled gestures and ignores button swipes', async () => {
  const onBack = vi.fn()
  const onNext = vi.fn()
  const onExit = vi.fn()
  render(
    <GuidanceCard
      step={1}
      isMoving={false}
      hasError={false}
      onStart={vi.fn()}
      onBack={onBack}
      onNext={onNext}
      onExit={onExit}
    />,
  )
  const dialog = await screen.findByRole('dialog', { name: 'Create A Watermark' })
  const send = (name: string, x: number, y: number, target: Element = dialog) => {
    const event = new MouseEvent(name, { bubbles: true, clientX: x, clientY: y })
    Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: 1 } })
    fireEvent(target, event)
  }
  send('pointerdown', 100, 100)
  send('pointerup', 90, 10)
  expect(onNext).not.toHaveBeenCalled()
  send('pointerdown', 200, 100)
  send('pointercancel', 100, 100)
  send('pointerup', 100, 100)
  expect(onNext).not.toHaveBeenCalled()
  send('pointerdown', 200, 100, screen.getByRole('button', { name: 'Next' }))
  send('pointerup', 100, 100)
  expect(onNext).not.toHaveBeenCalled()
  send('pointerdown', 200, 100)
  send('pointerup', 100, 100)
  expect(onNext).toHaveBeenCalledTimes(1)
  send('pointerdown', 100, 100)
  send('pointerup', 200, 100)
  expect(onBack).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(dialog, { key: 'ArrowRight' })
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
  expect(onNext).toHaveBeenCalledTimes(2)
  expect(onBack).toHaveBeenCalledTimes(2)
  await userEvent.keyboard('{Escape}')
  expect(onExit).toHaveBeenCalledTimes(1)
})
