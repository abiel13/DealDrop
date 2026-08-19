import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, listingRoute, watchlistFormRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";

import { ListingCard } from "@/features/listings/components/ListingCard";
import {
  getListingErrorMessage,
  getWatchlistMatches,
  setListingFavorite,
  setMatchFeedback,
  setMatchStatus,
} from "@/features/listings/services/listing.service";
import type { Listing } from "@/features/listings/types/listing.types";
import { getWatchlist } from "../services/watchlist.service";
import type { Watchlist } from "../types/watchlist.types";

function formatLifecycleState(state: Watchlist["lifecycle_state"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatLastChecked(value: string | null) {
  if (!value) {
    return "Not checked yet";
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not checked yet";
}

function formatFilters(watchlist: Watchlist) {
  const filters: string[] = [];
  const price = watchlist.filters.price;
  if (price?.min !== undefined || price?.max !== undefined) {
    const minimum = price.min === undefined ? "Any" : String(price.min);
    const maximum = price.max === undefined ? "Any" : String(price.max);
    filters.push(`Price ${minimum}–${maximum}${price.currency ? ` ${price.currency}` : ""}`);
  }

  if (watchlist.filters.location) {
    const location =
      typeof watchlist.filters.location === "string"
        ? watchlist.filters.location
        : watchlist.filters.location.name;
    filters.push(`Location: ${location}`);
  }

  if (watchlist.filters.conditions?.length) {
    filters.push(`Condition: ${watchlist.filters.conditions.join(", ")}`);
  }

  if (watchlist.filters.distance?.maxKm !== undefined) {
    filters.push(`Within ${watchlist.filters.distance.maxKm} km`);
  }

  return filters.length > 0 ? filters.join(" · ") : "No extra filters";
}

export function WatchlistDetailsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const watchlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [operationError, setOperationError] = useState<string | null>(null);

  const watchlistQuery = useQuery({
    queryKey: ["watchlist", user?.id, watchlistId],
    queryFn: () => getWatchlist(watchlistId as string),
    enabled: Boolean(user && watchlistId),
  });
  const matchesQuery = useInfiniteQuery({
    queryKey: ["watchlist-matches", user?.id, watchlistId],
    queryFn: ({ pageParam }) => getWatchlistMatches(watchlistId as string, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      const nextCursor = lastPage.pagination.nextCursor;
      if (!lastPage.pagination.hasMore || !nextCursor) {
        return undefined;
      }

      return allPageParams.includes(nextCursor) ? undefined : nextCursor;
    },
    enabled: Boolean(user && watchlistId),
  });

  const matches = useMemo(() => {
    const uniqueMatches = new Map<string, Listing>();
    for (const page of matchesQuery.data?.pages ?? []) {
      for (const listing of page.listings) {
        uniqueMatches.set(listing.match_id ?? listing.id, listing);
      }
    }

    return [...uniqueMatches.values()];
  }, [matchesQuery.data]);

  const favoriteMutation = useMutation({
    mutationFn: ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) =>
      setListingFavorite(listingId, isFavorite),
    onMutate: async ({ listingId, isFavorite }) => {
      setOperationError(null);
      await queryClient.cancelQueries({
        queryKey: ["watchlist-matches", user?.id, watchlistId],
      });
      const queryKey = ["watchlist-matches", user?.id, watchlistId] as const;
      const previousMatches = queryClient.getQueryData<typeof matchesQuery.data>(queryKey);
      queryClient.setQueryData<typeof matchesQuery.data>(queryKey, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                listings: page.listings.map((listing) =>
                  listing.id === listingId ? { ...listing, is_favorite: isFavorite } : listing,
                ),
              })),
            }
          : current,
      );
      return { previousMatches };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMatches) {
        queryClient.setQueryData(
          ["watchlist-matches", user?.id, watchlistId],
          context.previousMatches,
        );
      }
      setOperationError(getListingErrorMessage());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["watchlist-matches", user?.id, watchlistId],
      });
      void queryClient.invalidateQueries({ queryKey: ["saved-listings", user?.id] });
    },
  });

  const matchMutation = useMutation({
    mutationFn: ({
      matchId,
      action,
    }: {
      matchId: string;
      action:
        | { type: "feedback"; value: "relevant" | "not_relevant" }
        | { type: "status"; value: "unread" | "dismissed" };
    }) =>
      action.type === "feedback"
        ? setMatchFeedback(matchId, action.value)
        : setMatchStatus(matchId, action.value),
    onMutate: () => setOperationError(null),
    onError: () => setOperationError("We couldn't update that match. Please try again."),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["watchlist-matches", user?.id, watchlistId],
      });
      void queryClient.invalidateQueries({ queryKey: ["matched-listings", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["dismissed-history", user?.id] });
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (!watchlistId) {
    return <ErrorState title="Watchlist not found" description="That watchlist link is invalid." />;
  }

  if (watchlistQuery.isLoading || matchesQuery.isLoading) {
    return <Loading />;
  }

  if (watchlistQuery.isError || !watchlistQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Watchlist" backLabel="Back" onBack={() => goBack(router)} />
          <ErrorState
            title="Couldn't load this watchlist"
            description="Please check your connection and try again."
          />
          <Button variant="outline" onPress={() => void watchlistQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (matchesQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader
            title={watchlistQuery.data.name}
            backLabel="Back"
            onBack={() => goBack(router)}
          />
          <ErrorState
            title="Couldn't load matches"
            description="Your watchlist is safe. Please try loading its matches again."
          />
          <Button variant="outline" onPress={() => void matchesQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const watchlist = watchlistQuery.data;
  const disabled = favoriteMutation.isPending || matchMutation.isPending;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={matches}
        keyExtractor={(item) => item.match_id ?? item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            refreshing={watchlistQuery.isRefetching || matchesQuery.isRefetching}
            onRefresh={() => {
              void watchlistQuery.refetch();
              void matchesQuery.refetch();
            }}
          />
        }
        onEndReached={() => {
          if (matchesQuery.hasNextPage && !matchesQuery.isFetchingNextPage) {
            void matchesQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="mb-1 gap-5">
            <AppHeader
              title={watchlist.name}
              subtitle="Review the matches for this shopping task."
              backLabel="Back"
              onBack={() => goBack(router)}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => router.push(watchlistFormRoute(watchlist.id))}
                >
                  Edit
                </Button>
              }
            />

            <Card padding="md" className="gap-4">
              <DetailRow label="Search query" value={watchlist.search_query} />
              <DetailRow label="Filters" value={formatFilters(watchlist)} />
              <DetailRow
                label="Marketplaces"
                value={
                  watchlist.marketplace_scope === "all"
                    ? "All marketplaces"
                    : watchlist.marketplace_ids.map(formatMarketplaceName).join(", ") ||
                      "Unavailable"
                }
              />
              <View className="flex-row gap-8">
                <DetailRow
                  label="Lifecycle"
                  value={formatLifecycleState(watchlist.lifecycle_state)}
                />
                <DetailRow
                  label="Last check"
                  value={formatLastChecked(watchlist.last_checked_at)}
                />
              </View>
            </Card>

            {operationError && <AppText variant="error">{operationError}</AppText>}
            <AppText variant="title">Matches</AppText>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No matches yet"
            description="DealDrop will show listings here as this watchlist is checked."
          />
        }
        ListFooterComponent={
          matchesQuery.isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            disabled={disabled}
            onPress={() => router.push(listingRoute(item.id))}
            onFavoriteToggle={() =>
              favoriteMutation.mutate({ listingId: item.id, isFavorite: !item.is_favorite })
            }
            onFeedback={
              item.match_id
                ? (feedback) =>
                    matchMutation.mutate({
                      matchId: item.match_id as string,
                      action: { type: "feedback", value: feedback },
                    })
                : undefined
            }
            onDismiss={
              item.match_id && item.match_status !== "dismissed"
                ? () =>
                    matchMutation.mutate({
                      matchId: item.match_id as string,
                      action: { type: "status", value: "dismissed" },
                    })
                : undefined
            }
            onUndoDismiss={
              item.match_id && item.match_status === "dismissed"
                ? () =>
                    matchMutation.mutate({
                      matchId: item.match_id as string,
                      action: { type: "status", value: "unread" },
                    })
                : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-1">
      <AppText variant="caption" className="font-semibold uppercase tracking-[1px]">
        {label}
      </AppText>
      <AppText variant="bodySmall">{value}</AppText>
    </View>
  );
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(authRoutes.watchlists);
}
