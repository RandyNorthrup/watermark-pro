import { Camera } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { CAMERA_ACCEPT } from '../../../shared/constants'
import { isCaptureSupported } from '../../lib/capture'
import { Button } from '../ui/button'

interface TakePhotoButtonProps {
  /** Called with the photo the camera returns. */
  onCapture: (file: File) => void
}

/**
 * On a touch device, opens the OS camera through a hidden file input and hands
 * the captured photo to `onCapture`. Renders nothing where camera capture is
 * not offered (desktops), so callers can drop it in unconditionally.
 */
export function TakePhotoButton({ onCapture }: TakePhotoButtonProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  // `capture` is not a typed React attribute; set it on the element so the input
  // opens the rear camera rather than a file picker (same technique as
  // bulk-tool's `webkitdirectory`).
  useEffect(() => {
    inputRef.current?.setAttribute('capture', 'environment')
  }, [])

  if (!isCaptureSupported()) {
    return null
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={CAMERA_ACCEPT}
        aria-label={t('import.takePhoto')}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file !== undefined) {
            onCapture(file)
          }
          event.currentTarget.value = ''
        }}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          inputRef.current?.click()
        }}
      >
        <Camera aria-hidden="true" className="size-4" />
        {t('import.takePhoto')}
      </Button>
    </>
  )
}
