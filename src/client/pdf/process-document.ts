import { DocumentRasteriser } from './raster'
import { PdfReader } from './reader'
import { watermarkPdf } from './watermark-pdf'
import { artworkLicenseNotice } from '../../shared/asset-licenses'
import type { WatermarkSpec } from '../../shared/watermark'
import { ANALYSIS_MAX_SIDE, analyseSource } from '../engine/pipeline'
import { mainThreadBackend } from '../lib/canvas-backend'
import type { LogoLoader } from '../lib/mark-resources'
import { specForPhoto } from '../lib/spec-tokens'

const SINGLE_DOCUMENT_POSITION = { index: 1, count: 1 } as const

/** Keep the original PDF pages intact; analyze each real page before adding a transparent mark layer. */
export async function processDocument(
  file: File,
  specs: readonly WatermarkSpec[],
  loadLogo: LogoLoader,
  signal: AbortSignal,
  position: { index: number; count: number } = SINGLE_DOCUMENT_POSITION,
): Promise<Blob> {
  signal.throwIfAborted()
  const reader = await PdfReader.open(file)
  const rasteriser = new DocumentRasteriser(loadLogo)
  try {
    const output = await watermarkPdf(
      new Uint8Array(await file.arrayBuffer()),
      async (size, pageNumber) => {
        await rasteriser.prepare(
          specs.map((spec) => specForPhoto(spec, file, { ...position, output: size })),
        )
        const page = await reader.render(pageNumber, signal, ANALYSIS_MAX_SIDE)
        const bitmap = await createImageBitmap(page.file)
        try {
          const map = analyseSource(bitmap, undefined, mainThreadBackend())
          return await rasteriser.rasterise(size, map)
        } finally {
          bitmap.close()
        }
      },
      artworkLicenseNotice(specs),
      { perPage: true, signal },
    )
    return new Blob([Uint8Array.from(output)], { type: 'application/pdf' })
  } finally {
    rasteriser.close()
    await reader.close()
  }
}
