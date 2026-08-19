import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, listingRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

import { ListingCard } from "../components/ListingCard";
import {
  getListingErrorMessage,
  getSavedListings,
  getMatchedListings,
  setListingFavorite,
  setMatchFeedback,
  setMatchStatus,
} from "../services/listing.service";
import type { Listing } from "../types/listing.types";

export type ListingCollectionMode = "saved" | "history";

const COLLECTION_COPY: Record<
  ListingCollectionMode,
  { title: string; subtitle: string; emptyTitle: string; emptyDescription: string }
> = {
  saved: {
    title: "Saved listings",
    subtitle: "Keep promising opportunities in one predictable place.",
    emptyTitle: "No saved listings yet",
    emptyDescription: "Tap the heart on a listing to save it here for later.",
  },
  history: {
    title: "Dismissed history",
    subtitle: "Review dismissed matches without mixing them into your active feed.",
    emptyTitle: "No dismissed matches",
    emptyDescription: "Dismissed matches will remain reviewable here.",
  },
};

export function ListingCollectionScreen({ mode }: { mode: ListingCollectionMode }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const copy = COLLECTION_COPY[mode];
  const [operationError, setOperationError] = useState<string | null>(null);
  const userId = user?.id ?? "";
  const queryKey = [mode === "saved" ? "saved-listings" : "dismissed-history", userId] as const;

  const listingsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      mode === "saved"
        ? getSavedListings({ cursor: pageParam })
        : getMatchedListings({ status: "dismissed", cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      const nextCursor = lastPage.pagination.nextCursor;
      if (!lastPage.pagination.hasMore || !nextCursor) {
        return undefined;
      }

      return allPageParams.includes(nextCursor) ? undefined : nextCursor;
    },
    enabled: Boolean(userId),
  });

  const listings = useMemo(() => {
    const uniqueListings = new Map<string, Listing>();
    for (const page of listingsQuery.data?.pages ?? []) {
      for (const listing of page.listings) {
        uniqueListings.set(listing.id, listing);
      }
    }

    return [...uniqueListings.values()];
  }, [listingsQuery.data]);

  const favoriteMutation = useMutation({
    mutationFn: ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) =>
      setListingFavorite(listingId, isFavorite),
    onMutate: () => setOperationError(null),
    onError: () => setOperationError(getListingErrorMessage()),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["matched-listings", userId] });
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
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["matched-listings", userId] });
      void queryClient.invalidateQueries({ queryKey: ["saved-listings", userId] });
      void queryClient.invalidateQueries({ queryKey: ["dismissed-history", userId] });
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (listingsQuery.isLoading) {
    return <Loading />;
  }

  if (listingsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title={copy.title} backLabel="Back" onBack={() => goBack(router)} />
          <ErrorState
            title={`Couldn't load ${mode === "saved" ? "saved listings" : "history"}`}
            description="Please check your connection and try again."
          />
          <Button variant="outline" onPress={() => void listingsQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const disabled = favoriteMutation.isPending || matchMutation.isPending;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            refreshing={listingsQuery.isRefetching && !listingsQuery.isFetchingNextPage}
            onRefresh={() => void listingsQuery.refetch()}
          />
        }
        onEndReached={() => {
          if (listingsQuery.hasNextPage && !listingsQuery.isFetchingNextPage) {
            void listingsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="mb-1 gap-5">
            <AppHeader
              title={copy.title}
              subtitle={copy.subtitle}
              backLabel="Back"
              onBack={() => goBack(router)}
            />
            {operationError && <AppTextError message={operationError} />}
          </View>
        }
        ListEmptyComponent={
          <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
        }
        ListFooterComponent={
          listingsQuery.isFetchingNextPage ? (
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
              mode === "saved" && item.match_id && item.match_status !== "dismissed"
                ? () =>
                    matchMutation.mutate({
                      matchId: item.match_id as string,
                      action: { type: "status", value: "dismissed" },
                    })
                : undefined
            }
            onUndoDismiss={
              mode === "history" && item.match_id
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

function AppTextError({ message }: { message: string }) {
  return <AppText variant="error">{message}</AppText>;
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(authRoutes.home);
}
