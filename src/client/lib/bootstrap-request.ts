/** Initial account discovery needs an epoch fence even before a local account is admitted. */
import { toRequestError } from './api'
import { captureOfflineGeneration, currentOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  BOOTSTRAP_PATH,
  bootstrapSnapshotSchema,
  type BootstrapSnapshot,
} from '../../shared/bootstrap'

/** Read one verified shell snapshot; old successes and failures cannot cross an account transition. */
export async function fetchBootstrapSnapshot(): Promise<BootstrapSnapshot> {
  const generation = captureOfflineGeneration()
  const expectedUserId = currentOfflineUser()
  const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' })
  if (expectedUserId !== null) headers.set(ACCOUNT_ID_HEADER, expectedUserId)
  try {
    const response = await fetch(BOOTSTRAP_PATH, {
      method: 'POST',
      cache: 'no-store',
      headers,
      body: JSON.stringify({}),
    })
    generation.assertCurrent()
    if (!response.ok) throw await toRequestError(BOOTSTRAP_PATH, response)
    const data: unknown = await response.json()
    generation.assertCurrent()
    const snapshot = bootstrapSnapshotSchema.parse(data)
    if (expectedUserId !== null && snapshot.session.user.id !== expectedUserId)
      throw new Error('The signed-in account changed. Sign in again to continue.')
    return snapshot
  } catch (error) {
    generation.assertCurrent()
    throw error
  }
}
