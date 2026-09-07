import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs } from 'radix-ui'
import { type SubmitEvent, useState } from 'react'

import { FontPicker } from './font-picker'
import { LogoPicker } from './logo-picker'
import { PlacementPanel } from './placement-panel'
import { PreviewPanel } from './preview-panel'
import { ShapePanel } from './shape-panel'
import { StylePanel } from './style-panel'
import { SymbolPicker } from './symbol-picker'
import { TextEffects } from './text-effects'
import { presetNameSchema, type WatermarkDto } from '../../../shared/api'
import {
  MAX_QR_CONTENT_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TEXT_LINES,
  TEXT_TOKENS,
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
  { value: 'mark', label: 'Mark' },
  { value: 'placement', label: 'Placement' },
  { value: 'style', label: 'Style' },
] as const

const TEXT_HINT = `Up to ${String(MAX_TEXT_LENGTH)} characters on up to ${String(MAX_TEXT_LINES)} lines. ${TEXT_TOKENS.join(', ')} are filled in per photo.`

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
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [spec, setSpec] = useState<WatermarkSpec>(() => initial?.spec ?? blankSpec())
  const [drafts, setDrafts] = useState<Partial<Record<MarkKind, WatermarkSpec>>>({})

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
      setNameError('Give the preset a name of up to 60 characters.')
      return
    }
    setNameError(null)
    save.mutate({ name: parsedName.data, spec })
  }

  const isIncomplete = spec.kind === 'image' && spec.assetId === ''

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <Card className="flex flex-col gap-5">
        <Field label="Preset name" error={nameError ?? undefined}>
          {(controlProps) => (
            <Input
              {...controlProps}
              value={name}
              maxLength={60}
              placeholder="Studio signature"
              readOnly={!canManage}
              onChange={(event) => {
                setName(event.currentTarget.value)
              }}
            />
          )}
        </Field>

        <Tabs.Root defaultValue="mark" className="flex flex-col gap-4">
          <Tabs.List
            aria-label="Designer sections"
            className="inline-flex self-start rounded-lg border border-line bg-surface-raised p-1"
          >
            {SECTION_TABS.map((tab) => (
              <Tabs.Trigger key={tab.value} value={tab.value} className={tabTriggerClassName}>
                {tab.label}
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
              <Tabs.List aria-label="Mark type" className="flex gap-1 border-b border-line">
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
                    <Field label="Text" hint={TEXT_HINT}>
                      {(controlProps) => (
                        <Textarea
                          {...controlProps}
                          value={spec.text}
                          maxLength={MAX_TEXT_LENGTH}
                          rows={2}
                          onChange={(event) => {
                            setSpec({ ...spec, text: limitLines(event.currentTarget.value) })
                          }}
                        />
                      )}
                    </Field>
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
                    label="QR code content"
                    hint={`A link, usually. Up to ${String(MAX_QR_CONTENT_LENGTH)} characters; the code is always dark on a light field so it scans.`}
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
          <Alert tone="error" title="Could not save the preset">
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
            {initial === undefined ? 'Save preset' : 'Save changes'}
          </Button>
        ) : (
          <p className="text-sm text-ink-muted">Your role can view presets but not change them.</p>
        )}
      </Card>
      <PreviewPanel organizationId={organizationId} spec={spec} />
    </form>
  )
}
