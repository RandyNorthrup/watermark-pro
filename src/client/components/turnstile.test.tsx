import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/"]'

interface RenderOptions {
  sitekey: string
  theme: string
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
  window.localStorage.clear()
})

describe('Turnstile', () => {
  it('injects the script once, renders the widget and forwards tokens', async () => {
    const Turnstile = await loadComponent()
    const fake = fakeApi()
    const onToken = vi.fn()
    const view = render(<Turnstile siteKey="site-key" onToken={onToken} />)
    expect(screen.getByLabelText('Bot check')).toBeInTheDocument()
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
    expect(options.theme).toBe('auto')
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
    expect(await screen.findByRole('alert')).toHaveTextContent('The bot check failed to load')
    expect(onToken).toHaveBeenCalledWith(null)
  })

  it('reports a script that fails to download', async () => {
    const Turnstile = await loadComponent()
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    act(() => {
      scriptElement().dispatchEvent(new Event('error'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Turnstile could not be loaded')
  })

  it('reports a script that loads without defining the API', async () => {
    const Turnstile = await loadComponent()
    render(<Turnstile siteKey="site-key" onToken={vi.fn()} />)
    act(() => {
      scriptElement().dispatchEvent(new Event('load'))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Turnstile did not initialise')
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
})
