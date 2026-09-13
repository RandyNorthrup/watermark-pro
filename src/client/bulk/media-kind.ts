/** Admission hint only; each media decoder validates the actual bytes before processing. */
export function bulkMediaKind(file: File): 'image' | 'document' | 'video' | null {
  if (file.type.startsWith('image/') || /\.(?:png|jpe?g|webp|avif|gif|heic)$/i.test(file.name))
    return 'image'
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'document'
  if (file.type.startsWith('video/') || /\.(?:mp4|mov|webm)$/i.test(file.name)) return 'video'
  return null
}

/** Browser pickers and folder selection accept every media type that Bulk can decode. */
export const BULK_ACCEPTED_TYPES =
  'image/png,image/jpeg,image/webp,image/avif,image/gif,application/pdf,video/mp4,video/webm,video/quicktime'
