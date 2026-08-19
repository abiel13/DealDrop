import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { authRoutes, listingRoute, watchlistsRoute } from "@/features/auth/routes";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { AppHeader } from "@/features/navigation/components";

import { WeeklySummaryCard } from "../components/WeeklySummaryCard";
import { getWeeklySummary } from "../services/analytics.service";
import {
  getWeeklySummaryLinkTargets,
  shouldShowWeeklySummary,
} from "../utils/weekly-summary-navigation";

export function WeeklySummaryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const weeklySummaryQuery = useQuery({
    queryKey: ["weekly-summary", user?.id],
    queryFn: getWeeklySummary,
    enabled: Boolean(user),
    retry: false,
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (weeklySummaryQuery.isLoading) {
    return <Loading />;
  }

  if (weeklySummaryQuery.isError || !weeklySummaryQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader
            title="Weekly summary"
            subtitle="A quick look at what happened across your active watchlists."
            backLabel="Back"
            onBack={() => goBackOrProfile(router)}
          />
          <ErrorState
            title="Couldn't load your weekly summary"
            description="Your listings and alerts are still available. Please try again."
          />
          <Button variant="outline" onPress={() => void weeklySummaryQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const summary = weeklySummaryQuery.data;

  if (!shouldShowWeeklySummary(summary)) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader
            title="Weekly summary"
            subtitle="A quick look at what happened across your active watchlists."
            backLabel="Back"
            onBack={() => goBackOrProfile(router)}
          />
          <EmptyState
            title={summary.enabled ? "Create an active watchlist" : "Weekly summary is off"}
            description={
              summary.enabled
                ? "Create an active watchlist to start receiving weekly activity summaries."
                : "Turn on weekly summary in Notification settings when you want these updates."
            }
          />
          {!summary.enabled && (
            <Button variant="outline" onPress={() => router.push(authRoutes.notifications)}>
              Open notification settings
            </Button>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const targets = getWeeklySummaryLinkTargets(summary);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Weekly summary"
          subtitle="A quick look at what happened across your active watchlists."
          backLabel="Back"
          onBack={() => goBackOrProfile(router)}
        />
        <WeeklySummaryCard
          summary={summary}
          onOpenMatches={() => openRoute(router, targets.newMatches)}
          onOpenListing={(listingId) => openRoute(router, listingRoute(listingId))}
          onOpenWatchlist={(watchlistId) => openRoute(router, watchlistsRoute(watchlistId))}
        />
        <AppText variant="caption" className="text-text-secondary">
          Your summary covers the last 7 days and updates as DealDrop checks your watchlists.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function openRoute(router: ReturnType<typeof useRouter>, route: Href | null) {
  if (route) {
    router.push(route);
  }
}

function goBackOrProfile(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(authRoutes.profile);
}
