/** Shared watermark state for the inline document and video editors. */
import type { MarkGesture } from './mark-overlay'
import type { WatermarkDto } from '../../../shared/api-watermark'
import { type WatermarkSpec, watermarkSpecSchema } from '../../../shared/watermark'
import { createLayer, type Layer, MAX_LAYERS } from '../../editor/state'
import { blankSpec, withPlacement, withStyle } from '../../lib/spec-edit'
import type { VideoMotion } from '../../video/motion'
import { useDesignHistory } from '../designer/use-design-history'

interface MediaSceneState {
  layers: Layer[]
  draft: WatermarkSpec
  activeId: string | null
  animations: Record<string, VideoMotion>
}

function emptyScene(): MediaSceneState {
  return { layers: [], draft: blankSpec(), activeId: 'draft', animations: {} }
}

/** One history includes preset edits, canvas transforms, timing and keyframes. */
export function useMediaScene(canCreate: boolean) {
  const history = useDesignHistory(emptyScene())
  const { value, change } = history
  const layers =
    canCreate && value.activeId === 'draft'
      ? [...value.layers, { id: 'draft', presetId: '', spec: value.draft }]
      : value.layers
  const renderLayers = layers.filter((layer) => watermarkSpecSchema.safeParse(layer.spec).success)
  const outputSpecs =
    renderLayers.length === layers.length ? renderLayers.map((layer) => layer.spec) : []

  function changeSpec(spec: WatermarkSpec, layerId = value.activeId) {
    if (layerId === 'draft' || (layerId === null && canCreate))
      change({ ...value, draft: spec, activeId: 'draft' })
    else
      change({
        ...value,
        layers: value.layers.map((layer) => (layer.id === layerId ? { ...layer, spec } : layer)),
      })
  }

  function addPreset(preset: WatermarkDto) {
    if (value.layers.length >= MAX_LAYERS) return
    const layer = createLayer(preset.id, preset.spec)
    change({ ...value, layers: [...value.layers, layer], activeId: layer.id })
  }

  function saveDraft(preset: WatermarkDto) {
    if (value.layers.length >= MAX_LAYERS) return
    const layer = createLayer(preset.id, preset.spec)
    const { draft: motion, ...animations } = value.animations
    change({
      ...value,
      layers: [...value.layers, layer],
      activeId: layer.id,
      // Saving gives the same visible mark a permanent identity; its timeline
      // remains part of this video even though reusable presets contain style only.
      animations: motion === undefined ? animations : { ...animations, [layer.id]: motion },
    })
  }

  function gesture(id: string, event: MarkGesture) {
    if (event.phase === 'start') {
      history.begin()
      return
    }
    if (event.phase === 'end') {
      history.end()
      return
    }
    const layer = layers.find((entry) => entry.id === id)
    if (layer === undefined) return
    let spec = layer.spec
    const { patch } = event
    if (patch.x !== undefined && patch.y !== undefined)
      spec = withPlacement(spec, { mode: 'custom', x: patch.x, y: patch.y })
    if (patch.scale !== undefined) spec = withStyle(spec, { scale: patch.scale })
    if (patch.rotation !== undefined) spec = withStyle(spec, { rotation: patch.rotation })
    changeSpec(spec, id)
  }

  function removeLayer(id: string) {
    const animations = Object.fromEntries(
      Object.entries(value.animations).filter(([key]) => key !== id),
    )
    const layers = value.layers.filter((layer) => layer.id !== id)
    change({ ...value, layers, animations, activeId: layers.at(-1)?.id ?? null })
  }

  return {
    ...history,
    renderLayers,
    outputSpecs,
    changeSpec,
    addPreset,
    saveDraft,
    gesture,
    removeLayer,
    select: (id: string) => change({ ...value, activeId: id }),
    useTemplate: (spec: WatermarkSpec) =>
      change({
        ...value,
        draft: spec,
        activeId: 'draft',
        animations: Object.fromEntries(
          Object.entries(value.animations).filter(([id]) => id !== 'draft'),
        ),
      }),
    newPreset: () =>
      change({
        ...value,
        draft: blankSpec(),
        activeId: 'draft',
        animations: Object.fromEntries(
          Object.entries(value.animations).filter(([id]) => id !== 'draft'),
        ),
      }),
    clear: () => change({ ...emptyScene(), activeId: null }),
    newScene: () => history.reset(emptyScene()),
    // A replacement source keeps watermark styles, but old clip timestamps and
    // undo entries must not restore intervals outside the new video's duration.
    replaceSource: () => history.reset({ ...value, animations: {} }),
  }
}

export type MediaScene = ReturnType<typeof useMediaScene>
