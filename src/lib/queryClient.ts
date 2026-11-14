import { QueryClient } from '@tanstack/react-query'

/** Shared QueryClient — lets the sidebar prefetch and mutations share the cache. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
    },
  },
})
