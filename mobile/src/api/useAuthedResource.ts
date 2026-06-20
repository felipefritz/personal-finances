import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';

export function useAuthedResource<T>(loader: (token: string) => Promise<T>) {
  const { token, logout } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (refreshing = false) => {
      if (!token) {
        return;
      }

      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);
      try {
        const nextData = await loader(token);
        setData(nextData);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar la informacion';
        if (message.toLowerCase().includes('token')) {
          await logout();
        } else {
          setError(message);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loader, logout, token],
  );

  useEffect(() => {
    load();
  }, [load]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh: () => load(true),
  };
}
