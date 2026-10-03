/** One email-bound hold precedes creation; activation atomically consumes it and admits that user. */
export interface PublicAdmissionStore {
  reserve(email: string): Promise<string | null>
  activate(email: string, userId: string): Promise<boolean>
  release(email: string, userId: string): Promise<void>
}
