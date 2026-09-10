/** The proxy belongs to one disposable browser context and never changes global networking. */
export interface OfflineProxy {
  readonly origin: string
  readonly forwardedRequests: number
  setDisconnected(isDisconnected: boolean): void
  dropNextPhotoAcknowledgement(path: string): PhotoAcknowledgementLoss
  close(): Promise<void>
}

/** Start the exact-origin loopback transport used only by WebKit offline fixtures. */
export function createOfflineProxy(upstreamOrigin: string): Promise<OfflineProxy>
/** Evidence comes only from the actual upstream response and the closed client transport. */
export interface PhotoAcknowledgementLoss {
  readonly responseStatus: number | null
  readonly didDrop: boolean
  clear(): void | Promise<void>
}
