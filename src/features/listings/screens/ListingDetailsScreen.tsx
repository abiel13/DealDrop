import { useState } from "react";
import { Image, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";

import {
  getListing,
  getListingErrorMessage,
  setListingFavorite,
} from "../services/listing.service";
import { formatListingDate, formatListingPrice } from "../utils/listing.utils";

export function ListingDetailsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [operationError, setOperationError] = useState<string | null>(null);

  const listingQuery = useQuery({
    queryKey: ["listing", user?.id, listingId],
    queryFn: () => getListing(user!.id, listingId!),
    enabled: Boolean(user && listingId),
  });
  const favoriteMutation = useMutation({
    mutationFn: (isFavorite: boolean) => setListingFavorite(user!.id, listingId!, isFavorite),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing", user?.id, listingId] });
      void queryClient.invalidateQueries({ queryKey: ["matched-listings", user?.id] });
    },
    onError: () => setOperationError(getListingErrorMessage()),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (listingQuery.isLoading) {
    return <Loading />;
  }

  if (listingQuery.isError || !listingQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title="Couldn't load this listing"
          description="The listing may have expired or is temporarily unavailable."
        />
        <Button variant="outline" onPress={() => void listingQuery.refetch()}>
          Try again
        </Button>
      </SafeAreaView>
    );
  }

  const listing = listingQuery.data;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-6 py-6"
        refreshControl={
          <RefreshControl
            refreshing={listingQuery.isRefetching}
            onRefresh={() => void listingQuery.refetch()}
          />
        }
      >
        <Button variant="ghost" size="sm" className="self-start" onPress={() => router.back()}>
          Back
        </Button>

        {listing.images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            className="-mx-6"
          >
            {listing.images.map((image) => (
              <Image
                key={image}
                accessibilityLabel={`${listing.title} image`}
                className="h-72 w-screen bg-background"
                resizeMode="cover"
                source={{ uri: image }}
              />
            ))}
          </ScrollView>
        ) : (
          <View className="h-48 items-center justify-center rounded-2xl bg-surface">
            <AppText variant="caption">No image available</AppText>
          </View>
        )}

        <View className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <AppText variant="heading" className="flex-1">
              {listing.title}
            </AppText>
            <Pressable
              accessibilityLabel={
                listing.is_favorite ? "Remove listing favorite" : "Favorite listing"
              }
              accessibilityRole="button"
              disabled={favoriteMutation.isPending}
              hitSlop={8}
              onPress={() => favoriteMutation.mutate(!listing.is_favorite)}
            >
              <AppText
                variant="bodySmall"
                className={
                  listing.is_favorite ? "font-semibold text-primary" : "text-text-secondary"
                }
              >
                {listing.is_favorite ? "Saved" : "Save"}
              </AppText>
            </Pressable>
          </View>

          <AppText variant="heading" className="text-primary">
            {formatListingPrice(listing)}
          </AppText>
          {operationError && <AppText variant="error">{operationError}</AppText>}
        </View>

        <Card padding="md" className="gap-3">
          <AppText variant="title">Details</AppText>
          {listing.location && <DetailRow label="Location" value={listing.location} />}
          {listing.seller_name && <DetailRow label="Seller" value={listing.seller_name} />}
          {listing.category && <DetailRow label="Category" value={listing.category} />}
          {listing.condition && <DetailRow label="Condition" value={listing.condition} />}
          <DetailRow label="Listed" value={formatListingDate(listing.posted_at)} />
        </Card>

        {listing.description && (
          <Card padding="md" className="gap-2">
            <AppText variant="title">Description</AppText>
            <AppText variant="body">{listing.description}</AppText>
          </Card>
        )}

        <Button onPress={() => void Linking.openURL(listing.url)}>
          View on Facebook Marketplace
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <AppText variant="bodySmall">{label}</AppText>
      <AppText variant="label" className="flex-1 text-right">
        {value}
      </AppText>
    </View>
  );
}
