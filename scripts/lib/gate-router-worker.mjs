/** Keep native service/asset fetches inside workerd, away from the development HTTP proxy. */
import { isGateWorkerPath } from './gate-routing.mjs'

export default {
  fetch(request, env) {
    return isGateWorkerPath(new URL(request.url).pathname)
      ? env.APP.fetch(request)
      : env.ASSETS.fetch(request)
  },
}
