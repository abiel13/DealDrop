import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { SearchBar } from "@/components/ui/Searchbar";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, listingRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

import { ListingCard } from "../components/ListingCard";
import {
  getListingErrorMessage,
  getMatchedListings,
  setListingFavorite,
} from "../services/listing.service";
import type { Listing, ListingFilter, ListingSort } from "../types/listing.types";

interface OptionPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionPill({ label, selected, onPress }: OptionPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full px-4 py-2 ${selected ? "bg-primary" : "bg-surface"}`}
      onPress={onPress}
    >
      <AppText className={selected ? "font-semibold text-white" : "text-text-secondary"}>
        {label}
      </AppText>
    </Pressable>
  );
}

function listingMatchesSearch(listing: Listing, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    listing.title,
    listing.description,
    listing.location,
    listing.seller_name,
    listing.category,
    listing.condition,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

function sortListings(listings: Listing[], sort: ListingSort) {
  return [...listings].sort((first, second) => {
    if (sort === "newest") {
      return (
        new Date(second.posted_at ?? second.matched_at ?? second.first_seen_at).getTime() -
        new Date(first.posted_at ?? first.matched_at ?? first.first_seen_at).getTime()
      );
    }

    if (first.price === null) {
      return second.price === null ? 0 : 1;
    }

    if (second.price === null) {
      return -1;
    }

    const firstPrice = first.price;
    const secondPrice = second.price;
    return sort === "price_low" ? firstPrice - secondPrice : secondPrice - firstPrice;
  });
}

export function ListingFeedScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ListingSort>("newest");
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [operationError, setOperationError] = useState<string | null>(null);
  const userId = user?.id ?? "";

  const listingsQuery = useQuery({
    queryKey: ["matched-listings", userId],
    queryFn: () => getMatchedListings(userId),
    enabled: Boolean(userId),
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) =>
      setListingFavorite(userId, listingId, isFavorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matched-listings", userId] }),
    onError: () => setOperationError(getListingErrorMessage()),
  });

  const visibleListings = useMemo(() => {
    const filtered = (listingsQuery.data ?? []).filter((listing) => {
      if (!listingMatchesSearch(listing, search)) {
        return false;
      }

      if (filter === "favorites" && !listing.is_favorite) {
        return false;
      }

      return filter !== "with_images" || listing.images.length > 0;
    });

    return sortListings(filtered, sort);
  }, [filter, listingsQuery.data, search, sort]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (listingsQuery.isLoading) {
    return <Loading />;
  }

  if (listingsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title="Couldn't load listings"
          description="Please check your connection and try again."
        />
        <Button variant="outline" onPress={() => void listingsQuery.refetch()}>
          Try again
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            refreshing={listingsQuery.isRefetching}
            onRefresh={() => void listingsQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 gap-4">
            <AppHeader title="Your feed" subtitle="Browse listings matched to your watchlists." />

            <SearchBar
              accessibilityLabel="Search matched listings"
              placeholder="Search listings"
              value={search}
              onChangeText={setSearch}
            />

            <View className="gap-2">
              <AppText variant="label">Sort</AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                <OptionPill
                  label="Newest"
                  selected={sort === "newest"}
                  onPress={() => setSort("newest")}
                />
                <OptionPill
                  label="Price: low"
                  selected={sort === "price_low"}
                  onPress={() => setSort("price_low")}
                />
                <OptionPill
                  label="Price: high"
                  selected={sort === "price_high"}
                  onPress={() => setSort("price_high")}
                />
              </ScrollView>
            </View>

            <View className="gap-2">
              <AppText variant="label">Filter</AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                <OptionPill
                  label="All"
                  selected={filter === "all"}
                  onPress={() => setFilter("all")}
                />
                <OptionPill
                  label="Saved"
                  selected={filter === "favorites"}
                  onPress={() => setFilter("favorites")}
                />
                <OptionPill
                  label="With images"
                  selected={filter === "with_images"}
                  onPress={() => setFilter("with_images")}
                />
              </ScrollView>
            </View>

            {operationError && <AppText variant="error">{operationError}</AppText>}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={search || filter !== "all" ? "No listings found" : "No matched listings yet"}
            description={
              search || filter !== "all"
                ? "Try changing your search or filter."
                : "Run your marketplace worker after creating a watchlist to populate this feed."
            }
          />
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            disabled={favoriteMutation.isPending}
            onPress={() => router.push(listingRoute(item.id))}
            onFavoriteToggle={() => {
              setOperationError(null);
              favoriteMutation.mutate({ listingId: item.id, isFavorite: !item.is_favorite });
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}
