"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const supabase = getSupabaseBrowser();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) { return; }
      setUser(user);
      if (user) {
        fetch("/api/admin/check", { signal: ac.signal })
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) { return; }
            setIsAdmin(data.isAdmin);
          })
          .catch(() => {
            if (cancelled) { return; }
            setIsAdmin(false);
          })
          .finally(() => {
            if (cancelled) { return; }
            setIsLoading(false);
          });
      } else {
        setIsAdmin(false);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) { return; }
      setUser(session?.user ?? null);
      if (session?.user) {
        fetch("/api/admin/check", { signal: ac.signal })
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) { return; }
            setIsAdmin(data.isAdmin);
          })
          .catch(() => {
            if (cancelled) { return; }
            setIsAdmin(false);
          });
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      cancelled = true;
      ac.abort();
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, isAdmin, signOut }),
    [user, isLoading, isAdmin, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
