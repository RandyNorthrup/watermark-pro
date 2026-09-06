import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { describeAuthError } from './errors'
import { ORGANIZATION_QUERY_KEY } from './queries'

interface AuthResult {
  error: { message?: string | undefined; code?: string | undefined } | null
}

/**
 * Wraps a Better Auth client call that changes organization state: converts
 * the `{ error }` result into a thrown error, keeps the last failure message
 * for display, and refreshes every organization query on success.
 */
export function useAuthMutation<TInput>(action: (input: TInput) => Promise<AuthResult>) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: async (input: TInput) => {
      const result = await action(input)
      const failure = describeAuthError(result.error)
      if (failure !== null) {
        throw new Error(failure)
      }
    },
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEY })
    },
    onError: (failure) => {
      setError(failure.message)
    },
  })
  return {
    mutation,
    error,
    clearError: () => {
      setError(null)
    },
  }
}
