import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { api } from '../api/client';
import type { User } from '../types';

const tokenKey = 'finanzas.mobile.token';

const tokenStore = {
  async get() {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(tokenKey) ?? null;
    }
    return SecureStore.getItemAsync(tokenKey);
  },
  async set(value: string) {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(tokenKey, value);
      return;
    }
    await SecureStore.setItemAsync(tokenKey, value);
  },
  async delete() {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(tokenKey);
      return;
    }
    await SecureStore.deleteItemAsync(tokenKey);
  },
};

type AuthContextValue = {
  isReady: boolean;
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const storedToken = await tokenStore.get();
      if (!mounted) {
        return;
      }

      if (!storedToken) {
        setIsReady(true);
        return;
      }

      try {
        const currentUser = await api.me(storedToken);
        if (mounted) {
          setToken(storedToken);
          setUser(currentUser);
        }
      } catch {
        await tokenStore.delete();
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      token,
      user,
      async login(email, password) {
        const auth = await api.login(email, password);
        await tokenStore.set(auth.access_token);
        setToken(auth.access_token);
        setUser(auth.user);
      },
      async register(email, password, fullName) {
        const auth = await api.register(email, password, fullName);
        await tokenStore.set(auth.access_token);
        setToken(auth.access_token);
        setUser(auth.user);
      },
      async logout() {
        await tokenStore.delete();
        setToken(null);
        setUser(null);
      },
    }),
    [isReady, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
