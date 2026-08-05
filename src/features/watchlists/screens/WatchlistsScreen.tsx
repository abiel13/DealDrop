import { Alert, FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { SearchBar } from "@/components/ui/Searchbar";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, watchlistFormRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

import { WatchlistCard } from "../components/WatchlistCard";
import {
  deleteWatchlist,
  getWatchlistErrorMessage,
  getWatchlists,
  setWatchlistActive,
  setWatchlistFavorite,
} from "../services/watchlist.service";
import type { Watchlist } from "../types/watchlist.types";

export function WatchlistsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  const userId = user?.id ?? "";

  const watchlistsQuery = useQuery({
    queryKey: ["watchlists", userId],
    queryFn: () => getWatchlists(userId),
    enabled: Boolean(userId),
  });

  const invalidateWatchlists = () =>
    queryClient.invalidateQueries({ queryKey: ["watchlists", userId] });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setWatchlistActive(userId, id, isActive),
    onSuccess: invalidateWatchlists,
    onError: (error) => setOperationError(getWatchlistErrorMessage(error)),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      setWatchlistFavorite(userId, id, isFavorite),
    onSuccess: invalidateWatchlists,
    onError: (error) => setOperationError(getWatchlistErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWatchlist(userId, id),
    onSuccess: invalidateWatchlists,
    onError: (error) => setOperationError(getWatchlistErrorMessage(error)),
  });

  const filteredWatchlists = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return watchlistsQuery.data ?? [];
    }

    return (watchlistsQuery.data ?? []).filter((watchlist) =>
      `${watchlist.name} ${watchlist.search_query}`.toLowerCase().includes(normalizedSearch),
    );
  }, [search, watchlistsQuery.data]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (watchlistsQuery.isLoading) {
    return <Loading />;
  }

  if (watchlistsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title="Couldn't load watchlists"
          description="Please check your connection and try again."
        />
        <Button variant="outline" onPress={() => watchlistsQuery.refetch()}>
          Try again
        </Button>
      </SafeAreaView>
    );
  }

  const isMutating =
    activeMutation.isPending || favoriteMutation.isPending || deleteMutation.isPending;

  function confirmDelete(watchlist: Watchlist) {
    Alert.alert("Delete watchlist?", `"${watchlist.name}" and its saved search will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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
        disabled={isMutating}
        onDelete={() => confirmDelete(item)}
        onEdit={() => router.push(watchlistFormRoute(item.id))}
        onFavoriteToggle={() => {
          setOperationError(null);
          favoriteMutation.mutate({ id: item.id, isFavorite: !item.is_favorite });
        }}
        onPauseToggle={() => {
          setOperationError(null);
          activeMutation.mutate({ id: item.id, isActive: !item.is_active });
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={filteredWatchlists}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        ListHeaderComponent={
          <View className="mb-4 gap-5">
            <AppHeader
              title="Watchlists"
              subtitle="Save searches and we'll watch for matching listings."
              action={
                <Button size="sm" onPress={() => router.push(watchlistFormRoute())}>
                  New
                </Button>
              }
            />

            <SearchBar
              accessibilityLabel="Search watchlists"
              placeholder="Search watchlists"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />

            {operationError && <AppText variant="error">{operationError}</AppText>}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={search ? "No watchlists found" : "No watchlists yet"}
            description={
              search
                ? "Try a different name or search term."
                : "Create a watchlist and DealDrop will alert you when a matching listing appears."
            }
          />
        }
        renderItem={renderWatchlist}
      />
    </SafeAreaView>
  );
}
