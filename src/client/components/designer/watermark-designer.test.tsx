import { fireEvent, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi } from '../../test-support/fake-library-api'
import { renderedSpecs, resetFakePreview } from '../../test-support/fake-preview'
import { mockElementBounds } from '../../test-support/mock-element-bounds'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))

beforeEach(() => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
  installLibraryApi()
  resetFakePreview()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  mockElementBounds()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('undoes form/spec changes and supports native modifier shortcuts without losing kind drafts', async () => {
  const user = userEvent.setup()
  renderApp('/app/library/new')
  const name = await screen.findByLabelText('Preset name')
  const text = screen.getByRole('textbox', { name: 'Text' })
  const initialText = (text as HTMLTextAreaElement).value
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  fireEvent.change(name, { target: { value: 'Signature' } })
  fireEvent.change(text, { target: { value: 'First text' } })
  await user.click(screen.getByRole('tab', { name: 'Shape' }))
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('First text')
  fireEvent.keyDown(name, { key: 'z', ctrlKey: true })
  expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue(initialText)
  fireEvent.keyDown(name, { key: 'z', metaKey: true, shiftKey: true })
  expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('First text')
  fireEvent.keyDown(name, { key: 'y', ctrlKey: true })
  expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', { name: 'Text' }))
  expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('First text')
  expect(name).toHaveValue('Signature')
})

it('records a complete drag as one undoable change while final render uses final pointer coordinates', async () => {
  const user = userEvent.setup()
  renderApp('/app/library/new')
  const text = await screen.findByRole('textbox', { name: 'Text' })
  fireEvent.change(text, { target: { value: 'Canvas text' } })
  const frame = await screen.findByRole('group', { name: /Watermark position/ })
  await waitFor(() => expect(renderedSpecs.at(-1)).toMatchObject({ text: 'Canvas text' }))
  const initialPlacement = renderedSpecs.at(-1)?.placement
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: 384, clientY: 288 })
  for (let x = 300; x > 200; x -= 1)
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: x, clientY: 160, altKey: true })
  fireEvent.pointerUp(frame, { pointerId: 1, clientX: 240, clientY: 160, altKey: true })
  await waitFor(() =>
    expect(renderedSpecs.at(-1)?.placement).toEqual({ mode: 'custom', x: 0.5, y: 0.5 }),
  )
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(renderedSpecs.at(-1)?.placement).toEqual(initialPlacement))
  expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Canvas text')
  await user.click(screen.getByRole('button', { name: 'Redo' }))
  await waitFor(() =>
    expect(renderedSpecs.at(-1)?.placement).toEqual({ mode: 'custom', x: 0.5, y: 0.5 }),
  )
})

it('returns changed placement and appearance sliders to their defaults in one action', async () => {
  const user = userEvent.setup()
  renderApp('/app/library/new')
  await screen.findByRole('textbox', { name: 'Text' })

  await user.click(screen.getByRole('tab', { name: 'Style' }))
  const rotation = screen.getByRole('slider', { name: 'Rotation' })
  fireEvent.change(rotation, { target: { value: '27' } })
  expect(rotation).toHaveValue('27')
  await user.click(screen.getByRole('button', { name: 'Reset Rotation' }))
  expect(rotation).toHaveValue('0')

  await user.click(screen.getByRole('tab', { name: 'Placement' }))
  await user.click(screen.getByRole('radio', { name: 'Custom' }))
  const horizontal = screen.getByRole('slider', { name: 'Horizontal' })
  fireEvent.change(horizontal, { target: { value: '0.2' } })
  await user.click(screen.getByRole('button', { name: 'Reset Horizontal' }))
  expect(horizontal).toHaveValue('0.5')
})
