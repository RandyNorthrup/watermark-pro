/**
 * Default editor subject. This is the same licensed coast photograph shown on
 * the landing page, so the public preview and first editor canvas agree.
 */
import { SAMPLE_SCENE_PATH } from '../../shared/constants'

export const SAMPLE_PHOTO_WIDTH = 960
export const SAMPLE_PHOTO_HEIGHT = 640

/** Decode a fresh bitmap because renderers take ownership and close it. */
export async function createSamplePhoto(): Promise<ImageBitmap> {
  const response = await fetch(SAMPLE_SCENE_PATH)
  if (!response.ok) {
    throw new Error('The bundled sample photo could not be loaded.')
  }
  return await createImageBitmap(await response.blob())
}
