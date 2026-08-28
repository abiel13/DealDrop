import { createContext, useContext, useEffect, useState } from "react";
import { PAYWALL_RESULT, type PAYWALL_RESULT as PaywallResult } from "react-native-purchases-ui";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import {
  getProEntitlement,
  getProErrorMessage,
  hasProEntitlement,
  presentProPaywall,
  restoreProPurchases,
  syncProEntitlement,
} from "../services/pro.service";
import type { ProContextValue } from "../types/pro.types";

const ProContext = createContext<ProContextValue | undefined>(undefined);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<ProContextValue["access"]>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAccess() {
      if (!user) {
        if (isMounted) {
          setAccess(null);
          setError(null);
          setIsLoading(false);
          setIsProcessing(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const entitlement = await getProEntitlement();
        const reconciledEntitlement = entitlement.isPro
          ? entitlement
          : await syncProEntitlement().catch(() => entitlement);
        if (isMounted) {
          setAccess(reconciledEntitlement);
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

  async function presentPaywall(): Promise<PaywallResult> {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await presentProPaywall();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        setAccess(await syncProEntitlement());
      }
      return result;
    } catch (purchaseError: unknown) {
      setError(
        getProErrorMessage(
          purchaseError,
          "We couldn't open Pro subscription options. Please try again.",
        ),
      );
      throw purchaseError;
    } finally {
      setIsProcessing(false);
    }
  }

  async function restorePurchases() {
    setIsProcessing(true);
    setError(null);

    try {
      const customerInfo = await restoreProPurchases();
      setAccess(await syncProEntitlement());
      return hasProEntitlement(customerInfo);
    } catch (restoreError: unknown) {
      setError(
        getProErrorMessage(restoreError, "We couldn't restore Pro purchases. Please try again."),
      );
      throw restoreError;
    } finally {
      setIsProcessing(false);
    }
  }

  const value: ProContextValue = {
    access,
    isLoading,
    isProcessing,
    error,
    presentPaywall,
    restorePurchases,
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
