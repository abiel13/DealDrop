import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { SearchBar } from "@/components/ui/Searchbar";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, listingRoute } from "@/features/auth/routes";
import { appColors } from "@/styles/colors";

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
      className={`rounded-full px-4 py-2.5 ${selected ? "bg-primary" : "bg-surface-muted"}`}
      onPress={onPress}
    >
      <AppText
        variant="bodySmall"
        className={selected ? "font-semibold text-white" : "font-medium text-text-secondary"}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function FeedSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="gap-5 px-5 pb-8 pt-6">
        <View className="gap-2">
          <View className="h-3 w-20 rounded-full bg-background-muted" />
          <View className="h-9 w-52 rounded-xl bg-background-muted" />
          <View className="h-4 w-64 rounded-full bg-background-muted" />
        </View>
        <View className="h-14 rounded-2xl bg-background-muted" />
        <View className="h-6 w-28 rounded-full bg-background-muted" />
        {[0, 1].map((item) => (
          <View key={item} className="overflow-hidden rounded-3xl bg-surface">
            <View className="h-60 bg-background-muted" />
            <View className="gap-3 p-4">
              <View className="h-7 w-36 rounded-full bg-background-muted" />
              <View className="h-5 w-4/5 rounded-full bg-background-muted" />
              <View className="h-4 w-1/2 rounded-full bg-background-muted" />
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
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
        new Date(second.posted_at ?? second.matched_at ?? second.fetched_at ?? "").getTime() -
        new Date(first.posted_at ?? first.matched_at ?? first.fetched_at ?? "").getTime()
      );
    }

    if (first.price === null) {
      return second.price === null ? 0 : 1;
    }

    if (second.price === null) {
      return -1;
    }

    return sort === "price_low" ? first.price - second.price : second.price - first.price;
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
  const matchedListingsQueryKey = ["matched-listings", userId] as const;

  const listingsQuery = useQuery({
    queryKey: matchedListingsQueryKey,
    queryFn: getMatchedListings,
    enabled: Boolean(userId),
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) =>
      setListingFavorite(listingId, isFavorite),
    onMutate: async ({ listingId, isFavorite }) => {
      setOperationError(null);
      await queryClient.cancelQueries({ queryKey: matchedListingsQueryKey });
      const previousListings = queryClient.getQueryData<Listing[]>(matchedListingsQueryKey);

      queryClient.setQueryData<Listing[]>(matchedListingsQueryKey, (currentListings) =>
        currentListings?.map((listing) =>
          listing.id === listingId ? { ...listing, is_favorite: isFavorite } : listing,
        ),
      );

      return { previousListings };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousListings) {
        queryClient.setQueryData(matchedListingsQueryKey, context.previousListings);
      }
      setOperationError(getListingErrorMessage());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: matchedListingsQueryKey });
    },
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
    return <FeedSkeleton />;
  }

  if (listingsQuery.isError) {
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
            <AppText variant="heading">Your matches</AppText>
          </View>
          <ErrorState
            title="Couldn't load listings"
            description="Please check your connection and try again."
          />
          <Button
            variant="outline"
            leftIcon={<AppIcon name="refresh" size={18} color={appColors.primary} />}
            onPress={() => void listingsQuery.refetch()}
          >
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const hasActiveControls = Boolean(search.trim()) || filter !== "all" || sort !== "newest";

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow gap-4 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            colors={[appColors.primary]}
            progressBackgroundColor={appColors.surface}
            refreshing={listingsQuery.isRefetching}
            tintColor={appColors.primary}
            onRefresh={() => void listingsQuery.refetch()}
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
                <AppText variant="heading">Your matches</AppText>
                <AppText variant="bodySmall">Fresh finds from your watchlists.</AppText>
              </View>
              <View className="items-center rounded-2xl bg-primary-soft px-3 py-2">
                <AppText variant="caption" className="font-semibold uppercase text-primary">
                  Results
                </AppText>
                <AppText variant="title" className="text-primary">
                  {visibleListings.length}
                </AppText>
              </View>
            </View>

            <SearchBar
              accessibilityLabel="Search matched listings"
              leftIcon={<AppIcon name="search" size={19} color={appColors.textTertiary} />}
              placeholder="Search your matches"
              value={search}
              onChangeText={setSearch}
            />

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <AppText variant="label">Filter and sort</AppText>
                {hasActiveControls && (
                  <Pressable
                    accessibilityLabel="Reset feed filters and sorting"
                    accessibilityRole="button"
                    onPress={() => {
                      setSearch("");
                      setFilter("all");
                      setSort("newest");
                    }}
                  >
                    <AppText variant="bodySmall" className="font-semibold text-primary">
                      Reset
                    </AppText>
                  </Pressable>
                )}
              </View>

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
                <View className="mx-1 h-10 w-px bg-background-muted" />
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

            {operationError && <AppText variant="error">{operationError}</AppText>}
          </View>
        }
        ListEmptyComponent={
          <View className="pt-4">
            <EmptyState
              title={search || filter !== "all" ? "No listings found" : "No matched listings yet"}
              description={
                search || filter !== "all"
                  ? "Try changing your search or filter."
                  : "Run your marketplace worker after creating a watchlist to populate this feed."
              }
            />
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            disabled={favoriteMutation.isPending}
            onPress={() => router.push(listingRoute(item.id))}
            onFavoriteToggle={() => {
              favoriteMutation.mutate({ listingId: item.id, isFavorite: !item.is_favorite });
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}
