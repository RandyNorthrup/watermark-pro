/** Keep native service/asset fetches inside workerd, away from the development HTTP proxy. */
import { isGateWorkerPath } from './gate-routing.mjs'

export default {
  fetch(request, env) {
    // The native listener sees its own ephemeral address. Only trusted gate
    // configuration restores the external URL; Origin and account headers stay
    // untouched so the application's actual authorization checks still apply.
    const url = new URL(request.url)
    const external = new URL(env.GATE_ORIGIN)
    url.protocol = external.protocol
    url.host = external.host
    const forwarded = new Request(url, request)
    return isGateWorkerPath(url.pathname) ? env.APP.fetch(forwarded) : env.ASSETS.fetch(forwarded)
  },
}
