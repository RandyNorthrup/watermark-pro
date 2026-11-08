/**
 * The document, video, bulk and watermark-designer tools load beside their
 * routes rather than inside them: each page paints its heading while its
 * tool's code downloads, and the route loader starts that download once the
 * page's own code is under way (PLAN.md §5.5). The tools were the largest
 * element of their pages' critical path on a phone.
 */
import { deferredComponent } from '../lib/deferred-component'

export const documentsTool = deferredComponent(async () => {
  const { DocumentsTool } = await import('./documents/documents-tool')
  return DocumentsTool
})

export const videoTool = deferredComponent(async () => {
  const { VideoTool } = await import('./video/video-tool')
  return VideoTool
})

export const bulkTool = deferredComponent(async () => {
  const { BulkTool } = await import('./bulk/bulk-tool')
  return BulkTool
})

export const watermarkDesigner = deferredComponent(async () => {
  const { WatermarkDesigner } = await import('./designer/watermark-designer')
  return WatermarkDesigner
})
