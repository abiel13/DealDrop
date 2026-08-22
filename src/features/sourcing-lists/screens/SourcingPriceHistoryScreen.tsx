import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import type { ApiSourcingPriceSourceSummary } from "@/services/api";

import { getSourcingList, getSourcingProductPriceHistory } from "../services/sourcing-list.service";

export function SourcingPriceHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const params = useLocalSearchParams<{ id?: string; productId?: string }>();
  const sourcingListId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";
  const listQuery = useQuery({
    queryKey: ["sourcing-list", workspaceId, sourcingListId],
    queryFn: () => getSourcingList(workspaceId ?? "", sourcingListId),
    enabled: Boolean(user && workspaceId && sourcingListId),
  });
  const historyQuery = useQuery({
    queryKey: ["sourcing-price-history", workspaceId, sourcingListId, productId],
    queryFn: () => getSourcingProductPriceHistory(workspaceId ?? "", sourcingListId, productId),
    enabled: Boolean(user && workspaceId && sourcingListId && productId),
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (listQuery.isLoading || historyQuery.isLoading) return <Loading />;

  const product = listQuery.data?.products.find((item) => item.id === productId);
  if (listQuery.isError || historyQuery.isError || !product || !historyQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Price history" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't load price history"
            description="Price history is only available for observations DealDrop has recorded for this sourcing target."
          />
          <Button variant="outline" onPress={() => void historyQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const history = historyQuery.data;
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Price history"
          subtitle={product.productName}
          onBack={() => router.back()}
        />
        <Card padding="md" className="gap-2 bg-primary-soft">
          <AppText variant="label">Observed sourcing activity</AppText>
          <AppText variant="bodySmall">
            {history.totalObservationCount === 0
              ? "No observations yet. This page will fill in as DealDrop checks your selected sources."
              : `${history.totalObservationCount} observation${history.totalObservationCount === 1 ? "" : "s"} recorded by DealDrop.`}
          </AppText>
          <AppText variant="bodySmall">
            Target: {formatCost(history.targetPrice, history.targetPriceCurrency)} · basis:{" "}
            {history.targetCostBasis === "landed_unit_cost" ? "landed cost" : "marketplace price"}
          </AppText>
        </Card>

        {history.sources.map((source) => (
          <SourceSummaryCard key={source.source} source={source} />
        ))}

        {history.observations.length > 0 && (
          <Card padding="md" className="gap-3">
            <AppText variant="label">Recent observations</AppText>
            {history.observations.map((observation) => (
              <View key={observation.id} className="gap-1 border-b border-border pb-3">
                <View className="flex-row items-start justify-between gap-3">
                  <AppText className="flex-1 font-semibold">{observation.title}</AppText>
                  <AppText className="font-semibold text-primary">
                    {formatCost(observation.observedPrice, observation.currency)}
                  </AppText>
                </View>
                <AppText variant="caption">
                  {formatMarketplaceName(observation.source)} · {formatDate(observation.observedAt)}
                  {observation.sellerName ? ` · ${observation.sellerName}` : ""}
                </AppText>
                {observation.availableQuantity !== null && (
                  <AppText variant="caption">
                    Quantity observed: {observation.availableQuantity}
                  </AppText>
                )}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SourceSummaryCard({ source }: { source: ApiSourcingPriceSourceSummary }) {
  return (
    <Card padding="md" className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <AppText variant="title">{formatMarketplaceName(source.source)}</AppText>
        <AppText className="font-semibold text-primary">
          {source.targetReached === true ? "Target reached" : movementLabel(source.movement)}
        </AppText>
      </View>
      <AppText variant="bodySmall">
        Current observed price:{" "}
        {formatCost(source.currentObservedPrice, source.currentObservedCurrency)}
      </AppText>
      {source.observationCount >= 3 ? (
        <>
          <AppText variant="bodySmall">
            Recent low / high: {formatCost(source.recentLow, source.currency)} /{" "}
            {formatCost(source.recentHigh, source.currency)}
          </AppText>
          <AppText variant="bodySmall">
            Average observed: {formatCost(source.averageObservedPrice, source.currency)}
          </AppText>
        </>
      ) : (
        <AppText variant="caption">
          More observations are needed before a low, high, or average is shown (
          {source.observationCount}/3).
        </AppText>
      )}
      <AppText variant="caption">
        {source.observationCount} priced observation{source.observationCount === 1 ? "" : "s"}
      </AppText>
    </Card>
  );
}

function formatCost(value: number | null, currency: string | null) {
  return value === null ? "Unknown" : `${currency ? `${currency} ` : ""}${value.toFixed(2)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatMarketplaceName(source: string) {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function movementLabel(movement: ApiSourcingPriceSourceSummary["movement"]) {
  switch (movement) {
    case "down":
      return "Price down";
    case "up":
      return "Price up";
    case "stable":
      return "Stable";
    default:
      return "New data";
  }
}
