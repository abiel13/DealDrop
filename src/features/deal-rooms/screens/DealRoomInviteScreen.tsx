import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "react-native";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, dealRoomInviteRoute, dealRoomRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

import { acceptDealRoomInvitation, getDealRoomErrorMessage } from "../services/deal-room.service";

export function DealRoomInviteScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const returnTo = token ? dealRoomInviteRoute(token) : authRoutes.dealRoomInvite;

  const acceptMutation = useMutation({
    mutationFn: () => acceptDealRoomInvitation(token!),
    onSuccess: (room) => router.replace(dealRoomRoute(room.id)),
  });

  if (!token) {
    return (
      <InviteShell onBack={() => router.replace(authRoutes.home)}>
        <ErrorState
          title="Invitation link is incomplete"
          description="Ask the Deal Room owner to send you a fresh invitation link."
        />
      </InviteShell>
    );
  }

  if (!user) {
    return (
      <InviteShell onBack={() => router.replace(authRoutes.welcome)}>
        <Card padding="md" className="gap-4">
          <AppText variant="title">Join a Deal Room</AppText>
          <AppText variant="bodySmall">
            Sign in with the DealDrop account that received this invitation to continue.
          </AppText>
          <Button
            onPress={() => router.replace(getAuthRouteWithReturn(authRoutes.login, returnTo))}
          >
            Sign in
          </Button>
          <Button
            variant="outline"
            onPress={() => router.replace(getAuthRouteWithReturn(authRoutes.register, returnTo))}
          >
            Create an account
          </Button>
        </Card>
      </InviteShell>
    );
  }

  if (acceptMutation.isPending) {
    return <Loading />;
  }

  return (
    <InviteShell onBack={() => router.replace(authRoutes.home)}>
      {acceptMutation.isError ? (
        <>
          <ErrorState
            title="Couldn't join this Deal Room"
            description={getDealRoomErrorMessage(acceptMutation.error)}
          />
          <Button onPress={() => acceptMutation.mutate()}>Try again</Button>
        </>
      ) : (
        <Card padding="md" className="gap-4">
          <AppText variant="title">You’re invited</AppText>
          <AppText variant="bodySmall">
            Join this Deal Room to compare products, share your preferences, and keep decisions in
            one place.
          </AppText>
          <Button onPress={() => acceptMutation.mutate()}>Join Deal Room</Button>
        </Card>
      )}
    </InviteShell>
  );
}

function InviteShell({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <SafeAreaView className="flex-1 bg-background px-5">
      <View className="flex-1 gap-5 pt-6">
        <AppHeader
          title="Deal Room invitation"
          subtitle="Collaborate on products and deals with people you trust."
          onBack={onBack}
        />
        {children}
      </View>
    </SafeAreaView>
  );
}

function getAuthRouteWithReturn(route: Href, returnTo: Href) {
  return `${route}?returnTo=${encodeURIComponent(String(returnTo))}` as Href;
}
