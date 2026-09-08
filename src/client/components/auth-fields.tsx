import { useTranslation } from 'react-i18next'

import { Field } from './ui/field'
import { Input } from './ui/input'

interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  error?: string | undefined
}

export function EmailField({ value, onChange, error }: TextFieldProps) {
  const { t } = useTranslation()
  return (
    <Field label={t('auth.fields.emailLabel')} error={error}>
      {(control) => (
        <Input
          {...control}
          type="email"
          autoComplete="email"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}
    </Field>
  )
}

interface PasswordFieldProps extends TextFieldProps {
  label?: string
  autoComplete: 'current-password' | 'new-password'
  hint?: string | undefined
}

export function PasswordField({
  value,
  onChange,
  error,
  hint,
  autoComplete,
  label,
}: PasswordFieldProps) {
  const { t } = useTranslation()
  return (
    <Field label={label ?? t('auth.fields.passwordLabel')} hint={hint} error={error}>
      {(control) => (
        <Input
          {...control}
          type="password"
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}
    </Field>
  )
}
