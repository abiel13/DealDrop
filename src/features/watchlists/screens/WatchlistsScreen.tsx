import { Alert, FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { SearchBar } from "@/components/ui/Searchbar";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, watchlistFormRoute, watchlistRoute } from "@/features/auth/routes";
import { useTheme } from "@/providers/ThemeProvider";

import { WatchlistCard } from "../components/WatchlistCard";
import {
  deleteWatchlist,
  getWatchlistErrorMessage,
  getWatchlists,
  setWatchlistFavorite,
  setWatchlistLifecycle,
} from "../services/watchlist.service";
import type { Watchlist } from "../types/watchlist.types";

function WatchlistsSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="gap-5 px-5 pb-8 pt-6">
        <View className="flex-row items-end justify-between">
          <View className="gap-2">
            <View className="h-3 w-20 rounded-full bg-background-muted" />
            <View className="h-9 w-48 rounded-xl bg-background-muted" />
            <View className="h-4 w-64 rounded-full bg-background-muted" />
          </View>
          <View className="h-10 w-20 rounded-2xl bg-background-muted" />
        </View>
        <View className="h-14 rounded-2xl bg-background-muted" />
        {[0, 1].map((item) => (
          <View key={item} className="overflow-hidden rounded-3xl bg-surface">
            <View className="h-28 bg-background-muted" />
            <View className="gap-3 p-4">
              <View className="h-5 w-32 rounded-full bg-background-muted" />
              <View className="h-6 w-48 rounded-full bg-background-muted" />
              <View className="h-10 w-full rounded-2xl bg-background-muted" />
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

export function WatchlistsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ watchlistId?: string | string[] }>();
  const focusedWatchlistId = Array.isArray(params.watchlistId)
    ? params.watchlistId[0]
    : params.watchlistId;
  const [search, setSearch] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  const userId = user?.id ?? "";
  const watchlistsQueryKey = ["watchlists", userId] as const;

  const watchlistsQuery = useQuery({
    queryKey: watchlistsQueryKey,
    queryFn: getWatchlists,
    enabled: Boolean(userId),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({
      id,
      lifecycleState,
      snoozedUntil,
    }: {
      id: string;
      lifecycleState: Watchlist["lifecycle_state"];
      snoozedUntil?: string | null;
    }) => setWatchlistLifecycle(id, lifecycleState, snoozedUntil ?? null),
    onMutate: async ({ id, lifecycleState, snoozedUntil }) => {
      setOperationError(null);
      await queryClient.cancelQueries({ queryKey: watchlistsQueryKey });
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistsQueryKey);
      queryClient.setQueryData<Watchlist[]>(watchlistsQueryKey, (currentWatchlists) =>
        currentWatchlists?.map((watchlist) =>
          watchlist.id === id
            ? {
                ...watchlist,
                is_active: lifecycleState === "active" || lifecycleState === "snoozed",
                lifecycle_state: lifecycleState,
                snoozed_until: lifecycleState === "snoozed" ? (snoozedUntil ?? null) : null,
                completed_at: lifecycleState === "completed" ? new Date().toISOString() : null,
              }
            : watchlist,
        ),
      );
      return { previousWatchlists };
    },
    onError: (error, _variables, context) => {
      if (context?.previousWatchlists) {
        queryClient.setQueryData(watchlistsQueryKey, context.previousWatchlists);
      }
      setOperationError(getWatchlistErrorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: watchlistsQueryKey });
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      setWatchlistFavorite(id, isFavorite),
    onMutate: async ({ id, isFavorite }) => {
      setOperationError(null);
      await queryClient.cancelQueries({ queryKey: watchlistsQueryKey });
      const previousWatchlists = queryClient.getQueryData<Watchlist[]>(watchlistsQueryKey);
      queryClient.setQueryData<Watchlist[]>(watchlistsQueryKey, (currentWatchlists) =>
        currentWatchlists?.map((watchlist) =>
          watchlist.id === id ? { ...watchlist, is_favorite: isFavorite } : watchlist,
        ),
      );
      return { previousWatchlists };
    },
    onError: (error, _variables, context) => {
      if (context?.previousWatchlists) {
        queryClient.setQueryData(watchlistsQueryKey, context.previousWatchlists);
      }
      setOperationError(getWatchlistErrorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: watchlistsQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWatchlist(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: watchlistsQueryKey });
    },
    onError: (error) => setOperationError(getWatchlistErrorMessage(error)),
  });

  const filteredWatchlists = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const watchlists = watchlistsQuery.data ?? [];

    const filtered = normalizedSearch
      ? watchlists.filter((watchlist) =>
          `${watchlist.name} ${watchlist.search_query}`.toLowerCase().includes(normalizedSearch),
        )
      : watchlists;

    if (!focusedWatchlistId) {
      return filtered;
    }

    const focusedWatchlist = filtered.find((watchlist) => watchlist.id === focusedWatchlistId);
    return focusedWatchlist
      ? [focusedWatchlist, ...filtered.filter((watchlist) => watchlist.id !== focusedWatchlistId)]
      : filtered;
  }, [focusedWatchlistId, search, watchlistsQuery.data]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (watchlistsQuery.isLoading) {
    return <WatchlistsSkeleton />;
  }

  if (watchlistsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <View className="gap-1">
            <AppText
              variant="caption"
              className="font-semibold uppercase tracking-[2px] text-primary"
            >
              DEALDROP
            </AppText>
            <AppText variant="heading">Your watchlists</AppText>
          </View>
          <ErrorState
            title="Couldn't load watchlists"
            description="Please check your connection and try again."
          />
          <Button
            variant="outline"
            leftIcon={<AppIcon name="refresh" size={18} color={theme.colors.primary} />}
            onPress={() => void watchlistsQuery.refetch()}
          >
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const isMutating =
    lifecycleMutation.isPending || favoriteMutation.isPending || deleteMutation.isPending;

  function chooseSnooze(watchlist: Watchlist) {
    const options = [
      { label: "Until tomorrow", days: 1 },
      { label: "For 3 days", days: 3 },
      { label: "For 1 week", days: 7 },
    ];
    Alert.alert("Snooze watchlist", `Pause alerts for "${watchlist.name}".`, [
      ...options.map((option) => ({
        text: option.label,
        onPress: () => {
          const snoozedUntil = new Date(Date.now() + option.days * 24 * 60 * 60 * 1000);
          lifecycleMutation.mutate({
            id: watchlist.id,
            lifecycleState: "snoozed",
            snoozedUntil: snoozedUntil.toISOString(),
          });
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function confirmComplete(watchlist: Watchlist) {
    Alert.alert("Mark as purchased?", `Stop normal alerts for "${watchlist.name}".`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark completed",
        onPress: () => lifecycleMutation.mutate({ id: watchlist.id, lifecycleState: "completed" }),
      },
    ]);
  }

  function confirmDelete(watchlist: Watchlist) {
    Alert.alert("Delete watchlist?", `"${watchlist.name}" and its saved search will be removed.`, [
      { text: "Keep watchlist", style: "cancel" },
      {
        text: "Delete watchlist",
        style: "destructive",
        onPress: () => {
          setOperationError(null);
          deleteMutation.mutate(watchlist.id);
        },
      },
    ]);
  }

  function renderWatchlist({ item }: { item: Watchlist }) {
    return (
      <WatchlistCard
        watchlist={item}
        focused={item.id === focusedWatchlistId}
        disabled={isMutating}
        onDelete={() => confirmDelete(item)}
        onOpen={() => router.push(watchlistRoute(item.id))}
        onEdit={() => router.push(watchlistFormRoute(item.id))}
        onFavoriteToggle={() => {
          favoriteMutation.mutate({ id: item.id, isFavorite: !item.is_favorite });
        }}
        onPause={() => lifecycleMutation.mutate({ id: item.id, lifecycleState: "paused" })}
        onResume={() => lifecycleMutation.mutate({ id: item.id, lifecycleState: "active" })}
        onSnooze={() => chooseSnooze(item)}
        onComplete={() => confirmComplete(item)}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={filteredWatchlists}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
            refreshing={watchlistsQuery.isRefetching}
            tintColor={theme.colors.primary}
            onRefresh={() => void watchlistsQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-1 gap-5">
            <View className="flex-row items-end justify-between gap-4">
              <View className="flex-1 gap-1">
                <AppText
                  variant="caption"
                  className="font-semibold uppercase tracking-[2px] text-primary"
                >
                  DEALDROP
                </AppText>
                <AppText variant="heading">Your watchlists</AppText>
                <AppText variant="bodySmall">Keep your searches ready for the next deal.</AppText>
              </View>
              <View className="items-center rounded-2xl bg-primary-soft px-3 py-2">
                <AppText variant="caption" className="font-semibold uppercase text-primary">
                  Saved
                </AppText>
                <AppText variant="title" className="text-primary">
                  {watchlistsQuery.data?.length ?? 0}
                </AppText>
              </View>
            </View>

            <Button size="md" onPress={() => router.push(watchlistFormRoute())}>
              Create watchlist
            </Button>

            <Button
              size="md"
              variant="outline"
              onPress={() => router.push(authRoutes.productCapture)}
            >
              Paste a product link
            </Button>

            <SearchBar
              accessibilityLabel="Search watchlists"
              leftIcon={<AppIcon name="search" size={19} color={theme.colors.textTertiary} />}
              placeholder="Search watchlists"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />

            {operationError && <AppText variant="error">{operationError}</AppText>}
          </View>
        }
        ListEmptyComponent={
          <View className="gap-4 pt-4">
            <EmptyState
              title={search ? "No watchlists found" : "No watchlists yet"}
              description={
                search
                  ? "Try a different name or search term."
                  : "Create a watchlist and DealDrop will alert you when a matching listing appears."
              }
            />
            {!search && (
              <View className="gap-3">
                <Button variant="secondary" onPress={() => router.push(watchlistFormRoute())}>
                  Create your first watchlist
                </Button>
                <Button variant="outline" onPress={() => router.push(authRoutes.productCapture)}>
                  Paste a product link
                </Button>
              </View>
            )}
          </View>
        }
        renderItem={renderWatchlist}
      />
    </SafeAreaView>
  );
}
