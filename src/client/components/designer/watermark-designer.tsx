import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs } from 'radix-ui'
import { type SubmitEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FontPicker } from './font-picker'
import { LogoPicker } from './logo-picker'
import { PlacementPanel } from './placement-panel'
import { PreviewPanel } from './preview-panel'
import { ShapePanel } from './shape-panel'
import { StylePanel } from './style-panel'
import { SymbolPicker } from './symbol-picker'
import { TextEffects } from './text-effects'
import { TokenMenu } from './token-menu'
import { presetNameSchema, type WatermarkDto } from '../../../shared/api'
import {
  MAX_QR_CONTENT_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TEXT_LINES,
  type TextToken,
  type WatermarkSpec,
} from '../../../shared/watermark'
import { describeError } from '../../lib/errors'
import { createWatermark, libraryQueryKey, updateWatermark } from '../../lib/library'
import {
  blankSpec,
  defaultSpecFor,
  MARK_KINDS,
  type MarkKind,
  withPlacement,
} from '../../lib/spec-edit'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Field } from '../ui/field'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'

interface WatermarkDesignerProps {
  organizationId: string
  /** Existing preset to edit; omitted for a new one. */
  initial?: WatermarkDto | undefined
  canManage: boolean
  canManageLogos: boolean
  onSaved: (saved: WatermarkDto) => void
}

const tabTriggerClassName =
  'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:bg-brand-600 data-[state=active]:text-white'

const SECTION_TABS = [
  { value: 'mark', label: 'designer.sections.mark' },
  { value: 'placement', label: 'designer.sections.placement' },
  { value: 'style', label: 'designer.sections.style' },
] as const

/** Keeps a typed or pasted value within the line limit; extra line breaks join the last line. */
function limitLines(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= MAX_TEXT_LINES) {
    return text
  }
  return [...lines.slice(0, MAX_TEXT_LINES - 1), lines.slice(MAX_TEXT_LINES - 1).join(' ')].join(
    '\n',
  )
}

function isMarkKind(value: string): value is MarkKind {
  return MARK_KINDS.some((kind) => kind.value === value)
}

/**
 * Full preset editor: mark source, placement, contrast and style on the
 * left, live preview on the right. Drafts for each mark kind are kept so
 * switching tabs never discards what was typed.
 */
export function WatermarkDesigner({
  organizationId,
  initial,
  canManage,
  canManageLogos,
  onSaved,
}: WatermarkDesignerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [spec, setSpec] = useState<WatermarkSpec>(() => initial?.spec ?? blankSpec())
  const [drafts, setDrafts] = useState<Partial<Record<MarkKind, WatermarkSpec>>>({})
  const textRef = useRef<HTMLTextAreaElement>(null)

  /** Inserts a token at the caret (or the end) of the text mark and keeps focus after it. */
  function insertToken(token: TextToken) {
    if (spec.kind !== 'text') {
      return
    }
    const field = textRef.current
    const start = field?.selectionStart ?? spec.text.length
    const end = field?.selectionEnd ?? spec.text.length
    const next = limitLines(spec.text.slice(0, start) + token + spec.text.slice(end))
    setSpec({ ...spec, text: next })
    const caret = start + token.length
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(caret, caret)
    })
  }

  const save = useMutation({
    mutationFn: (body: { name: string; spec: WatermarkSpec }) =>
      initial === undefined
        ? createWatermark(organizationId, body)
        : updateWatermark(organizationId, initial.id, body),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: libraryQueryKey(organizationId) })
      onSaved(saved)
    },
  })

  function switchKind(kind: MarkKind) {
    if (kind === spec.kind) {
      return
    }
    setDrafts((previous) => ({ ...previous, [spec.kind]: spec }))
    const draft = drafts[kind]
    setSpec(draft === undefined ? defaultSpecFor(kind, spec) : withPlacement(draft, spec.placement))
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedName = presetNameSchema.safeParse(name)
    if (!parsedName.success) {
      setNameError(t('designer.nameError'))
      return
    }
    setNameError(null)
    save.mutate({ name: parsedName.data, spec })
  }

  const isIncomplete = spec.kind === 'image' && spec.assetId === ''

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <Card className="flex flex-col gap-5">
        <Field label={t('designer.presetName')} error={nameError ?? undefined}>
          {(controlProps) => (
            <Input
              {...controlProps}
              value={name}
              maxLength={60}
              placeholder={t('designer.presetNamePlaceholder')}
              readOnly={!canManage}
              onChange={(event) => {
                setName(event.currentTarget.value)
              }}
            />
          )}
        </Field>

        <Tabs.Root defaultValue="mark" className="flex flex-col gap-4">
          <Tabs.List
            aria-label={t('designer.sections.label')}
            className="inline-flex self-start rounded-lg border border-line bg-surface-raised p-1"
          >
            {SECTION_TABS.map((tab) => (
              <Tabs.Trigger key={tab.value} value={tab.value} className={tabTriggerClassName}>
                {t(tab.label)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="mark" className="flex flex-col gap-4 outline-none">
            <Tabs.Root
              value={spec.kind}
              onValueChange={(value) => {
                if (isMarkKind(value)) {
                  switchKind(value)
                }
              }}
              className="flex flex-col gap-4"
            >
              <Tabs.List
                aria-label={t('designer.markType')}
                className="flex gap-1 border-b border-line"
              >
                {MARK_KINDS.map((kind) => (
                  <Tabs.Trigger
                    key={kind.value}
                    value={kind.value}
                    className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:border-brand-600 data-[state=active]:text-ink"
                  >
                    {kind.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content value="text" className="flex flex-col gap-4 outline-none">
                {spec.kind === 'text' ? (
                  <>
                    <Field
                      label={t('designer.text.label')}
                      hint={t('designer.text.hint', {
                        max: MAX_TEXT_LENGTH,
                        lines: MAX_TEXT_LINES,
                      })}
                    >
                      {(controlProps) => (
                        <Textarea
                          {...controlProps}
                          ref={textRef}
                          value={spec.text}
                          maxLength={MAX_TEXT_LENGTH}
                          rows={2}
                          onChange={(event) => {
                            setSpec({ ...spec, text: limitLines(event.currentTarget.value) })
                          }}
                        />
                      )}
                    </Field>
                    <TokenMenu onInsert={insertToken} />
                    <FontPicker
                      family={spec.fontFamily}
                      weight={spec.fontWeight}
                      onFamilyChange={(fontFamily) => {
                        setSpec({ ...spec, fontFamily })
                      }}
                      onWeightChange={(fontWeight) => {
                        setSpec({ ...spec, fontWeight })
                      }}
                    />
                    <TextEffects spec={spec} onChange={setSpec} />
                  </>
                ) : null}
              </Tabs.Content>
              <Tabs.Content value="shape" className="outline-none">
                {spec.kind === 'shape' ? <ShapePanel spec={spec} onChange={setSpec} /> : null}
              </Tabs.Content>
              <Tabs.Content value="symbol" className="outline-none">
                {spec.kind === 'symbol' ? (
                  <SymbolPicker
                    symbol={spec.symbol}
                    onChange={(symbol) => {
                      setSpec({ ...spec, symbol })
                    }}
                  />
                ) : null}
              </Tabs.Content>
              <Tabs.Content value="image" className="outline-none">
                {spec.kind === 'image' ? (
                  <LogoPicker
                    organizationId={organizationId}
                    assetId={spec.assetId}
                    canManage={canManageLogos}
                    onChange={(assetId) => {
                      setSpec({ ...spec, assetId })
                    }}
                  />
                ) : null}
              </Tabs.Content>
              <Tabs.Content value="qr" className="flex flex-col gap-4 outline-none">
                {spec.kind === 'qr' ? (
                  <Field
                    label={t('designer.qr.content')}
                    hint={t('designer.qr.hint', { max: MAX_QR_CONTENT_LENGTH })}
                  >
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        value={spec.content}
                        maxLength={MAX_QR_CONTENT_LENGTH}
                        inputMode="url"
                        onChange={(event) => {
                          setSpec({ ...spec, content: event.currentTarget.value })
                        }}
                      />
                    )}
                  </Field>
                ) : null}
              </Tabs.Content>
            </Tabs.Root>
          </Tabs.Content>

          <Tabs.Content value="placement" className="outline-none">
            <PlacementPanel
              placement={spec.placement}
              onChange={(placement) => {
                setSpec(withPlacement(spec, placement))
              }}
            />
          </Tabs.Content>

          <Tabs.Content value="style" className="outline-none">
            <StylePanel spec={spec} onChange={setSpec} />
          </Tabs.Content>
        </Tabs.Root>

        {save.isError ? (
          <Alert tone="error" title={t('designer.saveError')}>
            {describeError(save.error)}
          </Alert>
        ) : null}
        {canManage ? (
          <Button
            type="submit"
            isPending={save.isPending}
            disabled={isIncomplete}
            className="self-start"
          >
            {t(initial === undefined ? 'designer.savePreset' : 'designer.saveChanges')}
          </Button>
        ) : (
          <p className="text-sm text-ink-muted">{t('designer.readOnlyHint')}</p>
        )}
      </Card>
      <PreviewPanel organizationId={organizationId} spec={spec} />
    </form>
  )
}
