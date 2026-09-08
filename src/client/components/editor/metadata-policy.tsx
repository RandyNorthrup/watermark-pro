import { useTranslation } from 'react-i18next'

import {
  canCarryMetadata,
  effectivePolicy,
  type MetadataPolicy,
  type OutputFormat,
} from '../../engine/encode'

interface MetadataPolicyFieldProps {
  policy: MetadataPolicy
  /** Keep modes are disabled for formats that cannot carry metadata (WebP). */
  format: OutputFormat
  onChange: (policy: MetadataPolicy) => void
}

interface PolicyChoice {
  value: MetadataPolicy
  label: string
  help: string
}

const CHOICES = [
  {
    value: 'strip',
    label: 'editor.metadata.strip.label',
    help: 'editor.metadata.strip.help',
  },
  {
    value: 'keep-except-location',
    label: 'editor.metadata.keepExceptLocation.label',
    help: 'editor.metadata.keepExceptLocation.help',
  },
  {
    value: 'keep',
    label: 'editor.metadata.keep.label',
    help: 'editor.metadata.keep.help',
  },
] as const satisfies readonly PolicyChoice[]

/** Radio list choosing how much of a photo's metadata an export keeps. */
export function MetadataPolicyField({ policy, format, onChange }: MetadataPolicyFieldProps) {
  const { t } = useTranslation()
  const isKeepDisabled = !canCarryMetadata(format)
  const selected = effectivePolicy(policy, format)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('editor.metadata.heading')}</legend>
      {CHOICES.map((choice) => {
        const isDisabled = isKeepDisabled && choice.value !== 'strip'
        return (
          <label
            key={choice.value}
            className="flex items-start gap-2 text-sm data-[disabled=true]:opacity-50"
            data-disabled={isDisabled}
          >
            <input
              type="radio"
              name="metadata-policy"
              className="mt-0.5 accent-brand-600"
              value={choice.value}
              checked={selected === choice.value}
              disabled={isDisabled}
              onChange={() => {
                onChange(choice.value)
              }}
            />
            <span className="flex flex-col">
              <span className="font-medium">{t(choice.label)}</span>
              <span className="text-xs text-ink-muted">{t(choice.help)}</span>
            </span>
          </label>
        )
      })}
      {isKeepDisabled ? (
        <p className="text-xs text-ink-muted">{t('editor.metadata.webpNote')}</p>
      ) : null}
    </fieldset>
  )
}
