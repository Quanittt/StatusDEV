import { useQuery } from '@tanstack/react-query'

import { ApiError, http } from '@/lib/api'
import type { Owner } from '@/lib/types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await http.get<Owner>('/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
}
