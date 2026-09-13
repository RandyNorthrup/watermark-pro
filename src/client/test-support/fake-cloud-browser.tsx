import type { ComponentProps } from 'react'

import { FAKE_CLOUD_TARGET, FAKE_CLOUD_FILE } from './fake-cloud-selection'
import type { CloudBrowserDialog } from '../components/import/cloud-browser-dialog'

/** Button-row tests exercise explicit destination handoff; real folder behavior has its own suite. */
export function FakeCloudBrowserDialog(props: ComponentProps<typeof CloudBrowserDialog>) {
  return (
    <div>
      <p>{props.provider}</p>
      <p>{props.mediaKinds?.join(',')}</p>
      <button type="button" onClick={props.onClose}>
        Close Browser
      </button>
      <button type="button" onClick={() => props.onError('Browser failed')}>
        Fail Browser
      </button>
      <button
        type="button"
        onClick={() => {
          if (props.mode === 'save') props.onDestination(FAKE_CLOUD_TARGET)
          else props.onImport([FAKE_CLOUD_FILE])
          props.onClose()
        }}
      >
        Confirm Selection
      </button>
    </div>
  )
}
