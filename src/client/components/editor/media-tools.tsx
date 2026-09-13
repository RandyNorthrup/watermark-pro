import { Eraser, FilePlus2, LibraryBig, Redo2, Stamp, Undo2 } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PresetPanel } from './preset-panel'
import type { MediaScene } from './use-media-scene'
import { WatermarkPanel } from './watermark-panel'
import type { WatermarkSpec } from '../../../shared/watermark'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

/** The same integrated preset/designer controls as Image, with media-specific panels below. */
export function MediaTools({
  organizationId,
  canCreate,
  scene,
  children,
  activeSpec,
  onSpecChange,
}: {
  organizationId: string
  canCreate: boolean
  scene: MediaScene
  children: ReactNode
  activeSpec?: WatermarkSpec | undefined
  onSpecChange?: ((spec: WatermarkSpec) => void) | undefined
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('watermark')
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div
        data-toolbox-scroll=""
        className="app-scroll-region flex max-h-[75svh] flex-col gap-4 overflow-y-auto overscroll-y-auto p-4 lg:max-h-[calc(100svh-8rem)]"
      >
        <Tabs.Root value={tab} onValueChange={setTab} className="flex min-w-0 flex-col gap-4">
          <Tabs.List
            aria-label={t('editor.toolsLabel')}
            className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-raised p-1"
          >
            {(
              [
                { value: 'presets', label: 'editor.tabs.presets', icon: LibraryBig },
                { value: 'watermark', label: 'editor.tabs.watermark', icon: Stamp },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                data-guidance-topic={value}
                className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:bg-brand-600 data-[state=active]:text-white"
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(label)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="presets" className="outline-none">
            <PresetPanel
              organizationId={organizationId}
              canCreate={canCreate}
              layers={scene.value.layers}
              activeLayerId={scene.value.activeId}
              onAddPreset={(preset) => {
                scene.addPreset(preset)
                setTab('watermark')
              }}
              onUseTemplate={(spec) => {
                scene.useTemplate(spec)
                setTab('watermark')
              }}
              onNewPreset={() => {
                scene.newPreset()
                setTab('watermark')
              }}
              onSelectLayer={(id) => {
                scene.select(id)
                setTab('watermark')
              }}
              onRemoveLayer={scene.removeLayer}
            />
          </Tabs.Content>
          <Tabs.Content value="watermark" className="outline-none">
            <WatermarkPanel
              organizationId={organizationId}
              canCreate={canCreate}
              draftSpec={activeSpec ?? scene.value.draft}
              undo={scene.undo}
              redo={scene.redo}
              canUndo={scene.canUndo}
              canRedo={scene.canRedo}
              layers={scene.value.layers.map((layer) =>
                activeSpec !== undefined && layer.id === scene.value.activeId
                  ? { ...layer, spec: activeSpec }
                  : layer,
              )}
              activeLayerId={scene.value.activeId}
              onAddPreset={scene.saveDraft}
              onSpecChange={onSpecChange ?? scene.changeSpec}
            />
          </Tabs.Content>
        </Tabs.Root>
        {children}
      </div>
    </Card>
  )
}

/** Common layout and history shortcuts keep document and video editing behavior aligned. */
export function MediaEditorLayout({ scene, children }: { scene: MediaScene; children: ReactNode }) {
  return (
    <div
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          !(event.ctrlKey || event.metaKey) ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )
          return
        const key = event.key.toLowerCase()
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          if (key === 'y' || event.shiftKey) scene.redo()
          else scene.undo()
        }
      }}
    >
      {children}
    </div>
  )
}

/** Single history toolbar; continuous touch and pointer gestures each form one undo step. */
export function MediaHistory({ scene }: { scene: MediaScene }) {
  const { t } = useTranslation()
  return (
    <div className="ms-auto flex items-center gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={scene.newScene}>
        <FilePlus2 aria-hidden="true" className="size-4" />
        {t('editor.newWorkspace')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('editor.undo')}
        disabled={!scene.canUndo}
        onClick={scene.undo}
      >
        <Undo2 aria-hidden="true" className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('editor.redo')}
        disabled={!scene.canRedo}
        onClick={scene.redo}
      >
        <Redo2 aria-hidden="true" className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('editor.clearCanvas')}
        onClick={scene.clear}
      >
        <Eraser aria-hidden="true" className="size-4" />
      </Button>
    </div>
  )
}
