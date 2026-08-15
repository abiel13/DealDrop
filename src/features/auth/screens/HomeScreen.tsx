import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";

import { WeeklySummaryCard } from "@/features/analytics/components/WeeklySummaryCard";
import { getWeeklySummary } from "@/features/analytics/services/analytics.service";
import { useAuth } from "../hooks/AuthProvider";
import { authRoutes, listingRoute, watchlistFormRoute } from "../routes";
import { getAuthErrorMessage } from "../services/auth.service";

export function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const weeklySummaryQuery = useQuery({
    queryKey: ["weekly-summary", user?.id],
    queryFn: getWeeklySummary,
    enabled: Boolean(user),
    retry: false,
  });

  if (isLoading) {
    return <Loading />;
  }

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  const displayName =
    (typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name) ||
    user.email?.split("@")[0] ||
    "there";

  async function handleSignOut() {
    setFormError(null);
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      setFormError(getAuthErrorMessage(error.message));
      return;
    }

    router.replace(authRoutes.login);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="grow px-6 py-8">
        <View className="flex-1">
          <View className="mb-10">
            <AppText variant="caption" className="mb-2 uppercase tracking-widest text-primary">
              DealDrop
            </AppText>
            <AppText variant="heading" className="mb-3">
              Good to see you, {displayName}.
            </AppText>
            <AppText variant="body" className="text-text-secondary">
              Your saved searches and alerts will be ready here.
            </AppText>
          </View>

          <Card padding="lg" className="mb-8">
            <AppText variant="label" className="mb-2 text-text-secondary">
              Signed in as
            </AppText>
            <AppText variant="title" numberOfLines={1}>
              {user.email}
            </AppText>
          </Card>

          {weeklySummaryQuery.data?.shouldShow && (
            <WeeklySummaryCard
              summary={weeklySummaryQuery.data}
              onOpenMatches={() => router.push(authRoutes.notifications)}
              onOpenListing={(listingId) => router.push(listingRoute(listingId))}
              onOpenWatchlist={(watchlistId) => router.push(watchlistFormRoute(watchlistId))}
            />
          )}

          <View className="mt-auto gap-4">
            {formError && <AppText variant="error">{formError}</AppText>}
            <Button variant="outline" loading={isSigningOut} onPress={handleSignOut}>
              Log out
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
