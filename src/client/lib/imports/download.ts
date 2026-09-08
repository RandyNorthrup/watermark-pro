/**
 * Turn bytes chosen from a cloud provider (Google Drive, Dropbox, OneDrive)
 * into a `File` the rest of the app ingests exactly like a local pick. Pure and
 * jsdom-testable: it performs no network. The provider supplies the display
 * name and, when its metadata carries one, the MIME type; a missing or empty
 * type falls back to the blob's own type so the downstream image filter
 * (`collectImages`, which keys on `image/`) still recognises the file.
 */
export function toImageFile(blob: Blob, name: string, type?: string): File {
  const resolvedType = type !== undefined && type.length > 0 ? type : blob.type
  return new File([blob], name, { type: resolvedType })
}
