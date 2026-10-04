import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/"]'

interface RenderOptions {
  sitekey: string
  action: string
  theme: string
  size: 'normal' | 'compact'
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

function fakeApi() {
  const calls: RenderOptions[] = []
  const remove = vi.fn()
  return {
    calls,
    remove,
    api: {
      render: vi.fn((_container: HTMLElement, options: RenderOptions) => {
        calls.push(options)
        return `widget-${String(calls.length)}`
      }),
      remove,
    },
  }
}

function scriptElement(): HTMLScriptElement {
  const script = document.head.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
  if (script === null) {
    throw new Error('Turnstile script was not injected')
  }
  return script
}

/** Each test gets a fresh module so the "load the script once" latch starts empty. */
async function loadComponent() {
  vi.resetModules()
  const module = await import('./turnstile')
  return module.Turnstile
}

beforeEach(() => {
  for (const script of document.head.querySelectorAll(SCRIPT_SELECTOR)) {
    script.remove()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('Turnstile', () => {
  it('injects the script once, renders the widget and forwards tokens', async () => {
    const Turnstile = await loadComponent()
    const fake = fakeApi()
    const onToken = vi.fn()
    const view = render(<Turnstile siteKey="site-key" onToken={onToken} />)
    expect(screen.getByLabelText('Human verification')).toBeInTheDocument()
    const script = scriptElement()
    expect(script.async).toBe(true)
    // A second widget while the script is still loading must not add another tag.
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    expect(document.head.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)

    vi.stubGlobal('turnstile', fake.api)
    act(() => {
      script.dispatchEvent(new Event('load'))
    })
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(2))
    const options = fake.calls[0]
    if (options === undefined) {
      throw new Error('widget was not rendered')
    }
    expect(options.sitekey).toBe('site-key')
    expect(options.action).toBe('account_admission')
    expect(options.theme).toBe('auto')
    expect(options.size).toBe('compact')
    expect(screen.getAllByLabelText('Human verification')[0]).toHaveStyle({ minHeight: '140px' })
    options.callback('fresh-token')
    expect(onToken).toHaveBeenCalledWith('fresh-token')
    options['expired-callback']()
    expect(onToken).toHaveBeenLastCalledWith(null)

    view.unmount()
    expect(fake.remove).toHaveBeenCalledWith('widget-1')
  })

  it('uses the stored theme and skips the script when the API is already present', async () => {
    window.localStorage.setItem('watermark-pro.theme', 'dark')
    const fake = fakeApi()
    vi.stubGlobal('turnstile', fake.api)
    const Turnstile = await loadComponent()
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledOnce())
    expect(document.head.querySelector(SCRIPT_SELECTOR)).toBeNull()
    expect(fake.calls[0]?.theme).toBe('dark')
  })

  it('reports a widget error and clears the token', async () => {
    const fake = fakeApi()
    vi.stubGlobal('turnstile', fake.api)
    const Turnstile = await loadComponent()
    const onToken = vi.fn()
    render(<Turnstile siteKey="site-key" onToken={onToken} />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledOnce())
    act(() => {
      fake.calls[0]?.['error-callback']()
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Human verification failed')
    expect(onToken).toHaveBeenCalledWith(null)
  })

  it('reports a script that fails to download', async () => {
    const Turnstile = await loadComponent()
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    act(() => {
      scriptElement().dispatchEvent(new Event('error'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Human verification is unavailable')
    expect(document.head.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(0)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry human verification' }))
    expect(document.head.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)
    const fake = fakeApi()
    vi.stubGlobal('turnstile', fake.api)
    act(() => {
      scriptElement().dispatchEvent(new Event('load'))
    })
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a script that loads without defining the API', async () => {
    const Turnstile = await loadComponent()
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    act(() => {
      scriptElement().dispatchEvent(new Event('load'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Human verification is unavailable')
  })

  it('does not render into a container after unmounting mid-load', async () => {
    const Turnstile = await loadComponent()
    const fake = fakeApi()
    const view = render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    const script = scriptElement()
    view.unmount()
    vi.stubGlobal('turnstile', fake.api)
    act(() => {
      script.dispatchEvent(new Event('load'))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fake.api.render).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('binds recovery to its own action and ignores callbacks after the widget is removed', async () => {
    const fake = fakeApi()
    vi.stubGlobal('turnstile', fake.api)
    const Turnstile = await loadComponent()
    const onToken = vi.fn()
    const view = render(
      <Turnstile siteKey="site-key" action="password_recovery" onToken={onToken} />,
    )
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledOnce())
    expect(fake.calls[0]?.action).toBe('password_recovery')
    onToken.mockClear()
    view.unmount()
    act(() => {
      fake.calls[0]?.callback('late-token')
      fake.calls[0]?.['expired-callback']()
      fake.calls[0]?.['error-callback']()
    })
    expect(onToken).not.toHaveBeenCalled()
    expect(fake.remove).toHaveBeenCalledOnce()
  })

  it('switches sizing when available width changes and invalidates the removed widget token', async () => {
    let width = 360
    let resized: () => void = vi.fn()
    const disconnect = vi.fn()
    vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(
      class {
        disconnect = disconnect
        observe = vi.fn()
        unobserve = vi.fn()
        constructor(callback: ResizeObserverCallback) {
          resized = vi.fn(() => callback([], this))
        }
      },
    )
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => new DOMRect(0, 0, width, 0))
    const fake = fakeApi()
    vi.stubGlobal('turnstile', fake.api)
    const Turnstile = await loadComponent()
    const onToken = vi.fn()
    const view = render(<Turnstile siteKey="site-key" onToken={onToken} />)
    await waitFor(() => expect(fake.calls.at(-1)?.size).toBe('normal'))
    expect(screen.getByLabelText('Human verification')).toHaveStyle({ minHeight: '65px' })
    const old = fake.calls.at(-1)
    act(() => old?.callback('wide-widget-token'))
    expect(onToken).toHaveBeenLastCalledWith('wide-widget-token')
    const before = fake.calls.length
    width = 280
    act(() => {
      resized()
    })
    await waitFor(() => expect(fake.calls.length).toBe(before + 1))
    expect(fake.calls.at(-1)?.size).toBe('compact')
    expect(screen.getByLabelText('Human verification')).toHaveStyle({ minHeight: '140px' })
    expect(fake.remove).toHaveBeenCalled()
    expect(onToken).toHaveBeenLastCalledWith(null)
    onToken.mockClear()
    act(() => old?.callback('stale-wide-token'))
    expect(onToken).not.toHaveBeenCalled()
    act(() => {
      resized()
    })
    expect(fake.calls.length).toBe(before + 1)
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    bounds.mockRestore()
  })
})
