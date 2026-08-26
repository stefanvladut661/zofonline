import { useQuery } from '@tanstack/react-query';

export function useApiPolling(key, fetcher, interval = 15000, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: fetcher,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    staleTime: interval / 2,
    retry: 2,
    placeholderData: (prev) => prev,
    ...options,
  });
}