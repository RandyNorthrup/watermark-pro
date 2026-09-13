import { bulkMediaKind } from './media-kind'
import { resolveNamePattern } from './names'
import type { BatchPosition, BulkJobInput, BulkResult, BulkSettings } from './processor'
import { artworkLicenseNotice } from '../../shared/asset-licenses'
import type { WatermarkSpec } from '../../shared/watermark'
import type { Size } from '../engine/layout'
import { seedFor } from '../engine/random'
import { type LogoLoader, MarkResources } from '../lib/mark-resources'
import { baseName, specForPhoto } from '../lib/spec-tokens'

function fileName(
  input: BulkJobInput,
  settings: BulkSettings,
  position: BatchPosition,
  size: Size | null,
  extension: string,
): string {
  if (
    size === null &&
    (settings.namePattern.includes('{width}') || settings.namePattern.includes('{height}'))
  )
    throw new Error('PDF file names cannot use pixel-width or pixel-height tokens.')
  const name = resolveNamePattern(settings.namePattern, {
    name: baseName(input.file.name),
    index: position.index,
    count: position.count,
    date: new Date(input.file.lastModified),
    preset: settings.presetName,
    // These fields are unreachable for a PDF pattern: explicitly refused above.
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  })
  return `${name}.${extension}`
}

/** Dedicated PDF/video paths reuse their editors' real exporters; image settings never silently alter them. */
export async function processBulkMedia(
  input: BulkJobInput,
  specs: readonly WatermarkSpec[],
  settings: BulkSettings,
  position: BatchPosition,
  signal: AbortSignal,
  loadLogo: LogoLoader,
): Promise<BulkResult> {
  signal.throwIfAborted()
  const kind = bulkMediaKind(input.file)
  if (input.override !== null)
    throw new Error(
      'Photo-only crop/adjustment overrides cannot be applied to documents or videos.',
    )
  const assetNotice = artworkLicenseNotice(specs)
  if (kind === 'document') {
    const { processDocument } = await import('../pdf/process-document')
    const name = fileName(input, settings, position, null, 'pdf')
    const blob = await processDocument(input.file, specs, loadLogo, signal, position)
    return {
      blob,
      fileName: name,
      relativePath: input.relativePath,
      width: null,
      height: null,
      ...(assetNotice !== null && { assetNotice }),
    }
  }
  if (kind !== 'video') throw new Error('This file is not a supported document or video.')
  const [{ detectVideoCapability }, { probeVideo }, plan, { VideoTranscoder }] = await Promise.all([
    import('../video/capabilities'),
    import('../video/probe'),
    import('../video/plan'),
    import('../video/worker-client'),
  ])
  const capability = await detectVideoCapability()
  if (!capability.supported)
    throw new Error('This browser cannot export video. Images and PDFs can still be processed.')
  const probe = await probeVideo(input.file)
  const size = plan.fitVideoSize(probe, settings.video?.resolution ?? 'original')
  const resources = new MarkResources(loadLogo)
  const worker = new VideoTranscoder()
  const cancel = () => worker.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const inputs = await resources.resolve(
      specs.map((spec) => specForPhoto(spec, input.file, { ...position, output: size })),
      seedFor(input.file),
    )
    if (signal.aborted) {
      for (const mark of inputs.marks) mark.image?.close()
      signal.throwIfAborted()
    }
    const blob = await worker.transcode(
      {
        source: input.file,
        marks: inputs.marks,
        fonts: inputs.fonts,
        plan: {
          videoCodec: capability.videoCodec,
          container: capability.container,
          output: size,
          bitrate: plan.scaleVideoBitrate(
            settings.video?.quality ?? 'high',
            size.width * size.height,
          ),
          audio: plan.planAudio(probe.audioCodec, capability.container, capability.canEncodeAudio),
        },
      },
      {},
    )
    signal.throwIfAborted()
    return {
      blob,
      fileName: fileName(input, settings, position, size, capability.container),
      relativePath: input.relativePath,
      ...size,
      ...(assetNotice !== null && { assetNotice }),
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    worker.terminate()
    resources.clear()
  }
}
