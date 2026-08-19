import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CustomerInfo } from "react-native-purchases";

import { useAuth } from "@/features/auth/hooks/AuthProvider";

import type { PremiumContextValue } from "../types/premium.types";
import {
  addPremiumCustomerInfoListener,
  configurePremiumSdk,
  getPremiumConfigurationError,
  getPremiumCustomerInfoForUser,
  getPremiumOffering,
  hasPremiumEntitlement,
  logOutPremiumUser,
  presentPremiumPaywall,
  presentPremiumCustomerCenter,
  restorePremiumPurchases,
} from "../services/premium.service";
import {
  getPremiumErrorKind,
  getPremiumErrorMessage,
  PremiumConfigurationError,
} from "../utils/premium-errors";

const PremiumContext = createContext<PremiumContextValue | undefined>(undefined);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const configuredRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<PremiumContextValue["errorKind"]>(null);
  const [retryToken, setRetryToken] = useState(0);

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
          setErrorKind(null);
          setIsLoading(false);
        }
        return;
      }

      if (currentUserIdRef.current !== user.id && isMounted) {
        setCustomerInfo(null);
      }

      if (isMounted) {
        setIsLoading(true);
        setError(null);
        setErrorKind(null);
      }

      try {
        const configurationError = getPremiumConfigurationError();
        if (configurationError) {
          throw new PremiumConfigurationError(configurationError);
        }

        if (!configuredRef.current) {
          configurePremiumSdk();
          configuredRef.current = true;
          if (isMounted) {
            setIsConfigured(true);
          }
        }

        const nextCustomerInfo = await getPremiumCustomerInfoForUser(user.id);
        currentUserIdRef.current = user.id;

        if (isMounted) {
          setCustomerInfo(nextCustomerInfo);
        }

        if (!hasPremiumEntitlement(nextCustomerInfo)) {
          await getPremiumOffering();
        }
      } catch (syncError) {
        if (isMounted) {
          setError(getPremiumErrorMessage(syncError));
          setErrorKind(getPremiumErrorKind(syncError));
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
  }, [retryToken, user]);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    return addPremiumCustomerInfoListener((nextCustomerInfo) => {
      setCustomerInfo(nextCustomerInfo);
    });
  }, [isConfigured]);

  async function refresh() {
    if (!user) {
      return;
    }

    try {
      const nextCustomerInfo = await getPremiumCustomerInfoForUser(user.id);
      setCustomerInfo(nextCustomerInfo);
      setError(null);
      setErrorKind(null);
    } catch (refreshError) {
      setError(getPremiumErrorMessage(refreshError));
      setErrorKind(getPremiumErrorKind(refreshError));
      throw refreshError;
    }
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
    if (!user) {
      return null;
    }

    try {
      const nextCustomerInfo = await restorePremiumPurchases(user.id);
      setCustomerInfo(nextCustomerInfo);
      setError(null);
      setErrorKind(null);
      return nextCustomerInfo;
    } catch (restoreError) {
      setError(getPremiumErrorMessage(restoreError));
      setErrorKind(getPremiumErrorKind(restoreError));
      throw restoreError;
    }
  }

  async function retry() {
    setRetryToken((currentToken) => currentToken + 1);
  }

  const value: PremiumContextValue = {
    isPremium: customerInfo ? hasPremiumEntitlement(customerInfo) : false,
    isLoading,
    error,
    errorKind,
    presentPaywall,
    manageSubscription,
    restorePurchases,
    refresh,
    retry,
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
