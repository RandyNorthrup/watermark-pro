import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HEALTH_PATH, HTTP_STATUS } from '../../shared/constants'
import { createAppRouter } from '../router'

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('home route', () => {
  it('loads the health check and renders it inside the shell', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ status: 'ok', environment: 'test' })),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAt('/')

    expect(await screen.findByRole('status')).toHaveTextContent('API ok')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('Watermark Pro')
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_PATH, expect.anything())
  })

  it('shows the error state when the API answers with a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: HTTP_STATUS.internalServerError }))),
    )

    renderAt('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('API is not reachable')
  })

  it('shows the error state when the API payload fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ status: 'nope' }))),
    )

    renderAt('/')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
