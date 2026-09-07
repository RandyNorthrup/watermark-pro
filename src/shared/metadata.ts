/**
 * Photo metadata read from a file's EXIF/XMP in the browser. Shared so the
 * client reader (`photo-metadata.ts`), the token resolver (`watermark.ts`) and
 * the byte editors (`engine/metadata/*`) agree on one shape. It is plain data;
 * `exif`/`xmp` are the raw segment bytes kept for the "keep" export policies.
 */

export interface GeoLocation {
  latitude: number
  longitude: number
}

/** Print density; the unit follows the EXIF ResolutionUnit / JFIF density unit. */
export interface PrintDensity {
  x: number
  y: number
  unit: 'inch' | 'cm'
}

export interface PhotoMetadata {
  takenAt: Date | null
  /** "Make Model"; Make is dropped when Model already starts with it. */
  camera: string | null
  lens: string | null
  iso: number | null
  /** f-number, e.g. 2.8. */
  aperture: number | null
  /** Exposure time in seconds, e.g. 0.004. */
  shutter: number | null
  /** Focal length in millimetres. */
  focalLength: number | null
  location: GeoLocation | null
  /** 1–8; informational only — the browser applies it when decoding. */
  orientation: number | null
  density: PrintDensity | null
  /** Raw Exif TIFF payload (APP1 body after "Exif\0\0"), for keep modes. */
  exif: Uint8Array | null
  /** Raw XMP packet, if present. */
  xmp: Uint8Array | null
}

/** All-null metadata: a file with no readable EXIF. */
export const EMPTY_PHOTO_METADATA: PhotoMetadata = {
  takenAt: null,
  camera: null,
  lens: null,
  iso: null,
  aperture: null,
  shutter: null,
  focalLength: null,
  location: null,
  orientation: null,
  density: null,
  exif: null,
  xmp: null,
}
