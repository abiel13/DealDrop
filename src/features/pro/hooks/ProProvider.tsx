import { createContext, useContext, useEffect, useState } from "react";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import { getProEntitlement } from "../services/pro.service";
import type { ProContextValue } from "../types/pro.types";

const ProContext = createContext<ProContextValue | undefined>(undefined);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<ProContextValue["access"]>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAccess() {
      if (!user) {
        if (isMounted) {
          setAccess(null);
          setError(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const entitlement = await getProEntitlement();
        if (isMounted) {
          setAccess(entitlement);
        }
      } catch (loadError: unknown) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Pro access is unavailable.");
          setAccess(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAccess();
    return () => {
      isMounted = false;
    };
  }, [user]);

  async function refresh() {
    if (!user) {
      return;
    }

    const entitlement = await getProEntitlement();
    setAccess(entitlement);
    setError(null);
  }

  const value: ProContextValue = {
    access,
    isLoading,
    error,
    refresh,
  };

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error("usePro must be used inside ProProvider");
  }

  return context;
}
