import type { WatermarkDto } from '../../../shared/api-watermark'
import type { WatermarkSpec } from '../../../shared/watermark'

/** The specs for the ticked presets, in the order ticked; unknown ids are dropped. */
export function selectedSpecs(
  selectedIds: readonly string[],
  presets: readonly WatermarkDto[] | undefined,
): WatermarkSpec[] {
  return selectedIds.flatMap((id) => {
    const preset = presets?.find((candidate) => candidate.id === id)
    return preset === undefined ? [] : [preset.spec]
  })
}
