import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { account, auth as authApi } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { MeResponse } from "../api/types";

interface AuthState {
  user: MeResponse | null;
  // loading is true only for the first /api/me call after page load.
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  // clear drops the local session (used when an API call returns 401).
  clear: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await account.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    account
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const clear = useCallback(() => setUser(null), []);

  const value = useMemo(() => ({ user, loading, refresh, signOut, clear }), [user, loading, refresh, signOut, clear]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// useUser returns the signed-in user; only call it inside RequireAuth.
export function useUser(): MeResponse {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}

// useSessionGuard turns a 401 from any API call into a redirect to login.
export function useSessionGuard(): (err: unknown) => boolean {
  const { clear } = useAuth();
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        clear();
        return true;
      }
      return false;
    },
    [clear],
  );
}
