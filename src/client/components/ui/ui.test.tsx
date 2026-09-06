import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Alert } from './alert'
import { Avatar } from './avatar'
import { Button } from './button'
import { Field } from './field'
import { Input } from './input'
import { useFormErrors } from '../../lib/use-form-errors'

describe('Button', () => {
  it('disables itself and shows a spinner while pending', () => {
    render(<Button isPending>Save</Button>)
    const button = screen.getByRole('button', { name: /Save/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })
})

describe('Alert', () => {
  it('uses an alert role for errors and a status role otherwise', () => {
    render(
      <>
        <Alert tone="error" title="Bad">
          details
        </Alert>
        <Alert tone="success">fine</Alert>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Bad')
    expect(screen.getByRole('status')).toHaveTextContent('fine')
  })
})

describe('Avatar', () => {
  it('falls back to initials without an image', async () => {
    render(<Avatar name="Ada Lovelace" image={null} />)
    expect(await screen.findByText('AL')).toBeInTheDocument()
  })
})

describe('Field with useFormErrors', () => {
  const schema = z.object({ email: z.email('Enter a valid email address') })

  function Demo() {
    const [email, setEmail] = useState('')
    const { errors, validate, clear } = useFormErrors<{ email: string }>()
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          validate(schema, { email })
        }}
      >
        <Field label="Email" hint="Work address preferred" error={errors.email}>
          {(control) => (
            <Input {...control} value={email} onChange={(event) => setEmail(event.target.value)} />
          )}
        </Field>
        <button type="submit">Check</button>
        <button type="button" onClick={clear}>
          Reset
        </button>
      </form>
    )
  }

  it('links hint and error text to the control and clears on demand', async () => {
    const user = userEvent.setup()
    render(<Demo />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAccessibleDescription('Work address preferred')
    expect(input).not.toHaveAttribute('aria-invalid')

    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Enter a valid email address/)

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.type(input, 'ada@example.test')
    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
