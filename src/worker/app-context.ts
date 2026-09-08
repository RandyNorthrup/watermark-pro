import type { AuthSession } from './auth/auth'
import type { Services } from './services'

/** Hono generics shared by every route module. */
export interface AppContext {
  Bindings: Env
  Variables: {
    services: Services
    /** Set by `requireSession`. */
    session: AuthSession
    /** Correlation id for this request; echoed as `X-Request-Id` and in logs. */
    requestId: string
  }
}
