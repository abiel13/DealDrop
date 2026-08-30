import { AppState, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharePayload } from "expo-sharing";

import { getSharePayloadFingerprint } from "../services/share-intent.service";

type SharingModule = typeof import("expo-sharing");

export interface IncomingShareCaptureState {
  payloads: SharePayload[];
  isResolving: boolean;
  error: string | null;
  clearSharedPayloads: () => void;
}

export function useIncomingShareCapture(): IncomingShareCaptureState {
  const sharingModuleRef = useRef<SharingModule | null>(null);
  const payloadFingerprintRef = useRef("");
  const [payloads, setPayloads] = useState<SharePayload[]>([]);
  const [isResolving, setIsResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsResolving(true);

    try {
      const sharing = sharingModuleRef.current ?? (await import("expo-sharing"));
      sharingModuleRef.current = sharing;
      const nextPayloads = sharing.getSharedPayloads();
      const fingerprint = getSharePayloadFingerprint(nextPayloads);

      if (fingerprint !== payloadFingerprintRef.current) {
        payloadFingerprintRef.current = fingerprint;
        setPayloads(nextPayloads);
      }

      setError(null);
    } catch {
      setError(
        "Share intake is unavailable in this app build. Please update DealDrop and try again.",
      );
    } finally {
      setIsResolving(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = setTimeout(() => void refresh(), 0);

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void refresh();
    });

    return () => {
      clearTimeout(initialRefresh);
      subscription.remove();
    };
  }, [refresh]);

  const clearSharedPayloads = useCallback(() => {
    try {
      sharingModuleRef.current?.clearSharedPayloads();
      payloadFingerprintRef.current = "";
      setPayloads([]);
      setError(null);
    } catch {
      setError("DealDrop could not clear the shared content. Please close and reopen the app.");
    }
  }, []);

  return { payloads, isResolving, error, clearSharedPayloads };
}
