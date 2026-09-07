import { SAMPLE_SCENE_PATH } from '../../shared/constants'
import { cn } from '../lib/cn'
import { SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from '../lib/sample-photo'

interface SampleSceneProps {
  className?: string
}

/**
 * The sample scene as a plain image, for the moment before the engine's
 * first frame arrives. It is what that frame shows anyway (minus the mark),
 * and an image paints with the page and counts as the largest paint, which
 * a spinner or a canvas would not; on a phone that is a second or two. The
 * routes that show it list it in `staticData.preloadImages`, so the request
 * starts at boot rather than when the page mounts.
 */
export function SampleScene({ className }: SampleSceneProps) {
  return (
    <img
      src={SAMPLE_SCENE_PATH}
      width={SAMPLE_PHOTO_WIDTH}
      height={SAMPLE_PHOTO_HEIGHT}
      fetchPriority="high"
      alt="Sample scene; the watermark preview is on its way"
      className={cn('block max-w-full', className)}
    />
  )
}
