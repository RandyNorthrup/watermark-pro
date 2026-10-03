/** Conservative launch budgets bound admission independently of challenge completion. */
export const PUBLIC_SIGNUP_POLICY = {
  admissionsPerWindow: 100,
  maximumAccounts: 10_000,
  windowMs: 86_400_000,
  reservationMs: 900_000,
  digestRadix: 16,
  digestPurpose: 'lumafoil-public-admission-v1',
} as const
