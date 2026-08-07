import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CustomerInfo } from "react-native-purchases";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import type { PremiumContextValue } from "../types/premium.types";
import {
  addPremiumCustomerInfoListener,
  configurePremiumSdk,
  getPremiumConfigurationError,
  getPremiumCustomerInfo,
  hasPremiumEntitlement,
  identifyPremiumUser,
  logOutPremiumUser,
  presentPremiumPaywall,
  presentPremiumCustomerCenter,
  restorePremiumPurchases,
} from "../services/premium.service";

const PremiumContext = createContext<PremiumContextValue | undefined>(undefined);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const configuredRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function syncUser() {
      if (!user) {
        if (configuredRef.current && currentUserIdRef.current) {
          try {
            await logOutPremiumUser();
          } catch {
            // The auth session has already ended, so there is no user access to preserve.
          }
        }

        currentUserIdRef.current = null;
        if (isMounted) {
          setCustomerInfo(null);
          setError(null);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const configurationError = getPremiumConfigurationError();
        if (configurationError) {
          throw new Error(configurationError);
        }

        if (!configuredRef.current) {
          configurePremiumSdk();
          configuredRef.current = true;
          setIsConfigured(true);
        }

        const nextCustomerInfo =
          currentUserIdRef.current === user.id
            ? await getPremiumCustomerInfo()
            : await identifyPremiumUser(user.id);
        currentUserIdRef.current = user.id;

        if (isMounted) {
          setCustomerInfo(nextCustomerInfo);
        }
      } catch (syncError) {
        if (isMounted) {
          setError(
            syncError instanceof Error
              ? syncError.message
              : "We couldn't verify your premium subscription.",
          );
          setCustomerInfo(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void syncUser();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    return addPremiumCustomerInfoListener((nextCustomerInfo) => {
      setCustomerInfo(nextCustomerInfo);
    });
  }, [isConfigured]);

  async function refresh() {
    const nextCustomerInfo = await getPremiumCustomerInfo();
    setCustomerInfo(nextCustomerInfo);
  }

  async function presentPaywall() {
    const result = await presentPremiumPaywall();
    await refresh();
    return result;
  }

  async function manageSubscription() {
    await presentPremiumCustomerCenter();
    await refresh();
  }

  async function restorePurchases() {
    const nextCustomerInfo = await restorePremiumPurchases();
    setCustomerInfo(nextCustomerInfo);
    return nextCustomerInfo;
  }

  const value: PremiumContextValue = {
    isPremium: customerInfo ? hasPremiumEntitlement(customerInfo) : false,
    isLoading,
    error,
    presentPaywall,
    manageSubscription,
    restorePurchases,
    refresh,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium() {
  const context = useContext(PremiumContext);

  if (!context) {
    throw new Error("usePremium must be used inside PremiumProvider");
  }

  return context;
}
