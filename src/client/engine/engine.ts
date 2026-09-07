/**
 * What the rest of the app sees of the watermark engine: one `apply` per
 * image, a count of work in flight (the bulk pool balances on it), and a
 * way to shut it down. `WatermarkWorker` runs it in a Web Worker;
 * `LocalEngine` runs it on the calling thread.
 */
import type { ApplyRequest } from './pipeline'
import type { ApplyDoneMessage, ApplyMessage } from './protocol'

export type ApplyInput = Omit<ApplyMessage, 'type' | 'id'>
export type ApplyOutput = Omit<ApplyDoneMessage, 'type' | 'id'>

export interface WatermarkEngine {
  /** Number of requests in flight. */
  readonly busy: number
  /**
   * Applies the marks. The source and image bitmaps belong to the engine
   * from this point on and are closed once the result is ready.
   */
  apply(input: ApplyInput): Promise<ApplyOutput>
  /** Stops the engine; pending requests reject and later ones are refused. */
  terminate(): void
}

/** The pipeline request an engine input describes; optional parts stay absent, not undefined. */
export function toApplyRequest(input: ApplyInput): ApplyRequest {
  return {
    source: input.source,
    marks: input.marks.map((mark) => ({
      spec: mark.spec,
      ...(mark.image !== undefined && { image: mark.image }),
      ...(mark.iconPath !== undefined && { iconPath: mark.iconPath }),
      ...(mark.seed !== undefined && { seed: mark.seed }),
    })),
    output: input.output,
    ...(input.transform !== undefined && { transform: input.transform }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  }
}

/** Releases every bitmap an input carried; engines own them once handed over. */
export function closeInputBitmaps(input: ApplyInput): void {
  input.source.close()
  for (const mark of input.marks) {
    mark.image?.close()
  }
}
