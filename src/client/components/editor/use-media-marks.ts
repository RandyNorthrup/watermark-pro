import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { WatermarkSpec } from '../../../shared/watermark'
import { FontLoader } from '../../engine/fonts'
import type { RenderableMark } from '../../engine/render'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { MarkResources } from '../../lib/mark-resources'
import { loadWorkspaceMedia } from '../../lib/offline-media'

function resourceKey(specs: readonly WatermarkSpec[]): string {
  return JSON.stringify(
    specs.map((spec) => {
      switch (spec.kind) {
        case 'text': {
          return [spec.kind, spec.fontFamily, spec.fontWeight]
        }
        case 'image': {
          return [spec.kind, spec.assetId]
        }
        case 'symbol': {
          return [spec.kind, spec.symbol]
        }
        default: {
          return [spec.kind]
        }
      }
    }),
  )
}

/** Resolve fonts/logos only when resources change; drag, playback and style updates draw immediately. */
export function useMediaMarks(organizationId: string, specs: readonly WatermarkSpec[]) {
  const resources = useMemo(
    () =>
      new MarkResources(
        async (id) => await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, id)),
      ),
    [organizationId],
  )
  const [fonts] = useState(() => new FontLoader(document.fonts))
  const [state, setState] = useState<{
    key: string
    marks: RenderableMark[]
    error: string | null
  }>({ key: '', marks: [], error: null })
  const latest = useRef(specs)
  useLayoutEffect(() => {
    latest.current = specs
  }, [specs])
  const key = `${organizationId}:${resourceKey(specs)}`
  useEffect(() => {
    let isActive = true
    let marks: RenderableMark[] = []
    void resources
      .resolve(latest.current)
      .then(async (result) => {
        marks = result.marks
        await fonts.ensure(result.fonts)
        if (isActive) setState({ key, marks, error: null })
        else for (const mark of marks) mark.image?.close()
      })
      .catch((error: unknown) => {
        for (const mark of marks) mark.image?.close()
        if (isActive) setState({ key, marks: [], error: describeError(error) })
      })
    return () => {
      isActive = false
      for (const mark of marks) mark.image?.close()
    }
  }, [key, resources, fonts])
  useEffect(() => () => resources.clear(), [resources])
  return {
    marks:
      state.key === key
        ? specs.flatMap((spec, index) => {
            const mark = state.marks[index]
            return mark === undefined ? [] : [{ ...mark, spec }]
          })
        : [],
    error: state.key === key ? state.error : null,
  }
}
