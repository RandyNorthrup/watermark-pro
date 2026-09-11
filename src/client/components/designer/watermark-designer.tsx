import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Redo2, Undo2 } from 'lucide-react'
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
import { useDesignHistory } from './use-design-history'
import { presetNameSchema } from '../../../shared/api'
import type { WatermarkDto } from '../../../shared/api-watermark'
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
  initialSpec?: WatermarkSpec | undefined
  previewPhoto?: File | undefined
  submitLabel?: string | undefined
  canManage: boolean
  canSave?: boolean | undefined
  canManageLogos: boolean
  onSaved: (saved: WatermarkDto) => void
  /** Inline editor uses its one main canvas and authoritative document history. */
  inline?:
    | {
        spec: WatermarkSpec
        onChange: (spec: WatermarkSpec) => void
        undo: () => void
        redo: () => void
        canUndo: boolean
        canRedo: boolean
      }
    | undefined
}

interface DesignerDraft {
  name: string
  spec: WatermarkSpec
  drafts: Partial<Record<MarkKind, WatermarkSpec>>
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
export function WatermarkDesigner(props: WatermarkDesignerProps) {
  return (
    <WatermarkDesignerSession
      key={`${props.organizationId}:${props.initial?.id ?? 'new'}`}
      {...props}
    />
  )
}

function WatermarkDesignerSession({
  organizationId,
  initial,
  initialSpec,
  previewPhoto,
  submitLabel,
  canManage,
  canSave = canManage,
  canManageLogos,
  onSaved,
  inline,
}: WatermarkDesignerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const history = useDesignHistory<DesignerDraft>({
    name: initial?.name ?? '',
    spec: initial?.spec ?? initialSpec ?? blankSpec(),
    drafts: {},
  })
  const { name, drafts } = history.value
  const spec = inline?.spec ?? history.value.spec
  function setName(name: string) {
    history.change({ ...history.value, name })
  }
  function setSpec(spec: WatermarkSpec) {
    history.change({ ...history.value, spec })
    inline?.onChange(spec)
  }
  const undo = () => {
    if (inline === undefined) history.undo()
    else inline.undo()
  }
  const redo = () => {
    if (inline === undefined) history.redo()
    else inline.redo()
  }
  const [nameError, setNameError] = useState<string | null>(null)
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
    networkMode: 'always',
    mutationFn: (body: { name: string; spec: WatermarkSpec }) =>
      initial === undefined
        ? createWatermark(organizationId, body)
        : updateWatermark(organizationId, initial.id, {
            ...body,
            expectedUpdatedAt: initial.updatedAt,
          }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: libraryQueryKey(organizationId) })
      onSaved(saved)
    },
  })

  function switchKind(kind: MarkKind) {
    if (kind === spec.kind) {
      return
    }
    const draft = drafts[kind]
    const next =
      draft === undefined ? defaultSpecFor(kind, spec) : withPlacement(draft, spec.placement)
    history.change({ ...history.value, spec: next, drafts: { ...drafts, [spec.kind]: spec } })
    inline?.onChange(next)
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
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
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (!canManage || !(event.ctrlKey || event.metaKey)) return
        const key = event.key.toLowerCase()
        if (key !== 'z' && key !== 'y') return
        event.preventDefault()
        event.stopPropagation()
        if (key === 'y' || event.shiftKey) redo()
        else undo()
      }}
      className={
        inline === undefined
          ? 'grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'
          : 'min-w-0'
      }
    >
      <Card
        className={
          inline === undefined
            ? 'flex flex-col gap-5'
            : 'flex min-w-0 flex-col gap-5 border-0 bg-transparent p-0 shadow-none'
        }
      >
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
                className="flex flex-wrap gap-1 border-b border-line"
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
                      onFamilyChange={(fontFamily, fontWeight) => {
                        setSpec({ ...spec, fontFamily, fontWeight: fontWeight ?? spec.fontWeight })
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
                <p className="text-sm text-ink-muted">{t('designer.qr.savedHint')}</p>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!(inline?.canUndo ?? history.canUndo)}
              onClick={undo}
              aria-keyshortcuts="Control+Z Meta+Z"
            >
              <Undo2 aria-hidden="true" className="size-4" />
              {t('editor.undo')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!(inline?.canRedo ?? history.canRedo)}
              onClick={redo}
              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y"
            >
              <Redo2 aria-hidden="true" className="size-4" />
              {t('editor.redo')}
            </Button>
            {canSave ? (
              <Button
                type="submit"
                isPending={save.isPending}
                disabled={isIncomplete}
                className="self-start"
              >
                {submitLabel ??
                  t(initial === undefined ? 'designer.savePreset' : 'designer.saveChanges')}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('designer.readOnlyHint')}</p>
        )}
      </Card>
      {inline === undefined ? (
        <PreviewPanel
          organizationId={organizationId}
          spec={spec}
          initialPhoto={previewPhoto}
          onSpecChange={canManage ? setSpec : undefined}
          onGesturePhase={(phase) => {
            if (phase === 'start') history.begin()
            else if (phase === 'end') history.end()
          }}
        />
      ) : null}
    </form>
  )
}
