import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";

import {
  getListing,
  getListingErrorMessage,
  setListingFavorite,
} from "../services/listing.service";
import type { Listing } from "../types/listing.types";
import {
  formatListingDate,
  formatListingPrice,
  formatListingRecency,
  formatMarketplaceName,
} from "../utils/listing.utils";

function DetailsSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="gap-5 px-5 pb-8 pt-6">
        <View className="gap-3">
          <View className="h-5 w-20 rounded-full bg-background-muted" />
          <View className="h-3 w-20 rounded-full bg-background-muted" />
          <View className="h-9 w-48 rounded-xl bg-background-muted" />
        </View>
        <View className="h-80 rounded-3xl bg-background-muted" />
        <View className="gap-3 rounded-3xl bg-surface p-5">
          <View className="h-8 w-40 rounded-full bg-background-muted" />
          <View className="h-8 w-4/5 rounded-full bg-background-muted" />
          <View className="h-4 w-1/2 rounded-full bg-background-muted" />
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ListingDetailsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [currentImage, setCurrentImage] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [operationError, setOperationError] = useState<string | null>(null);
  const listingQueryKey = ["listing", user?.id, listingId] as const;

  const listingQuery = useQuery({
    queryKey: listingQueryKey,
    queryFn: () => getListing(listingId!),
    enabled: Boolean(user && listingId),
  });
  const favoriteMutation = useMutation({
    mutationFn: (isFavorite: boolean) => setListingFavorite(listingId!, isFavorite),
    onMutate: async (isFavorite) => {
      setOperationError(null);
      await queryClient.cancelQueries({ queryKey: listingQueryKey });
      const previousListing = queryClient.getQueryData<Listing>(listingQueryKey);
      queryClient.setQueryData<Listing>(listingQueryKey, (currentListing) =>
        currentListing ? { ...currentListing, is_favorite: isFavorite } : currentListing,
      );
      return { previousListing };
    },
    onError: (_error, _isFavorite, context) => {
      if (context?.previousListing) {
        queryClient.setQueryData(listingQueryKey, context.previousListing);
      }
      setOperationError(getListingErrorMessage());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listingQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["matched-listings", user?.id] });
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (listingQuery.isLoading) {
    return <DetailsSkeleton />;
  }

  if (!listingId || listingQuery.isError || !listingQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Listing details" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't load this listing"
            description="The listing may have expired or is temporarily unavailable."
          />
          <Button
            variant="outline"
            leftIcon={<AppIcon name="refresh" size={18} color={theme.colors.primary} />}
            onPress={() => void listingQuery.refetch()}
          >
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const listing = listingQuery.data;
  const images = listing.images;
  const metadata = [
    listing.condition ? { label: "Condition", value: listing.condition } : null,
    listing.category ? { label: "Category", value: listing.category } : null,
    listing.posted_at ? { label: "Listed", value: formatListingDate(listing.posted_at) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pb-8 pt-6"
        refreshControl={
          <RefreshControl
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
            refreshing={listingQuery.isRefetching}
            tintColor={theme.colors.primary}
            onRefresh={() => void listingQuery.refetch()}
          />
        }
      >
        <AppHeader title="Listing details" onBack={() => router.back()} />

        <Gallery
          images={images}
          failedImages={failedImages}
          currentImage={currentImage}
          pageWidth={width}
          onImageChange={setCurrentImage}
          onImageError={(image) => {
            setFailedImages((current) => (current.includes(image) ? current : [...current, image]));
          }}
          title={listing.title}
        />

        <Card padding="md" className="gap-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-1.5 rounded-full bg-primary-soft px-3 py-2">
              <AppIcon name="storefront" size={15} color={theme.colors.primary} />
              <AppText variant="caption" className="font-semibold text-primary">
                {formatMarketplaceName(listing.marketplace_id)}
              </AppText>
            </View>

            <FavoriteButton
              isFavorite={listing.is_favorite}
              disabled={favoriteMutation.isPending}
              onPress={() => favoriteMutation.mutate(!listing.is_favorite)}
            />
          </View>

          <AppText variant="display" className="text-primary">
            {formatListingPrice(listing)}
          </AppText>

          <AppText variant="heading">{listing.title || "Untitled listing"}</AppText>

          {listing.location && (
            <View className="flex-row items-center gap-2">
              <AppIcon name="place" size={17} color={theme.colors.textSecondary} />
              <AppText variant="bodySmall" className="flex-1">
                {listing.location}
              </AppText>
            </View>
          )}

          {operationError && <AppText variant="error">{operationError}</AppText>}
        </Card>

        <PriceContext listing={listing} />

        {listing.seller_name && (
          <Card padding="md" className="gap-3">
            <AppText variant="caption" className="font-semibold uppercase tracking-[1px]">
              Seller
            </AppText>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-soft">
                <AppIcon name="person" size={20} color={theme.colors.primary} />
              </View>
              <AppText variant="title" className="flex-1">
                {listing.seller_name}
              </AppText>
            </View>
          </Card>
        )}

        {listing.description?.trim() && (
          <Card padding="md" className="gap-3">
            <AppText variant="title">Description</AppText>
            <AppText variant="body">{listing.description.trim()}</AppText>
          </Card>
        )}

        {metadata.length > 0 && (
          <Card padding="md" className="gap-4">
            <AppText variant="title">More details</AppText>
            {metadata.map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </Card>
        )}

        <View className="gap-2">
          <Button
            leftIcon={<AppIcon name="storefront" size={18} color="white" />}
            rightIcon={<AppIcon name="arrow-forward" size={18} color="white" />}
            onPress={() => void Linking.openURL(listing.url)}
          >
            View on {formatMarketplaceName(listing.marketplace_id)}
          </Button>
          <AppText variant="caption" className="text-center">
            Check the original listing for seller contact and purchase details.
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PriceContext({ listing }: { listing: Listing }) {
  const history = listing.price_history;
  const target = listing.price_target;

  return (
    <>
      {target && (
        <Card padding="md" className="gap-3">
          <AppText variant="title">Watchlist target</AppText>
          <DetailRow
            label="Maximum price"
            value={formatListingPrice({ price: target.price, currency: target.currency })}
          />
          {target.sameCurrency && target.difference !== null ? (
            <AppText variant="bodySmall" className="text-text-secondary">
              {target.difference <= 0
                ? formatListingPrice({
                    price: Math.abs(target.difference),
                    currency: target.currency,
                  }) + " below your target."
                : formatListingPrice({ price: target.difference, currency: target.currency }) +
                  " above your target."}
            </AppText>
          ) : (
            <AppText variant="caption">
              Current price cannot be compared because the currencies do not match or are not known.
            </AppText>
          )}
        </Card>
      )}

      {history && (
        <Card padding="md" className="gap-3">
          <AppText variant="title">Price history</AppText>

          {history.status === "available" && history.dealIndicator ? (
            <View className="gap-1 rounded-2xl bg-primary-soft p-3">
              <AppText variant="label" className="text-primary">
                {dealIndicatorLabel(history.dealIndicator)}
              </AppText>
              <AppText variant="bodySmall" className="text-text-secondary">
                {history.explanation}
              </AppText>
            </View>
          ) : (
            <AppText variant="bodySmall" className="text-text-secondary">
              {history.explanation}
            </AppText>
          )}

          {history.lowestPrice !== null && history.highestPrice !== null && history.currency && (
            <DetailRow
              label={
                history.lowestPrice === history.highestPrice ? "Observed price" : "Observed range"
              }
              value={formatPriceRange(history.lowestPrice, history.highestPrice, history.currency)}
            />
          )}

          {history.averagePrice !== null && history.currency && history.status === "available" && (
            <DetailRow
              label="Observed average"
              value={formatListingPrice({
                price: history.averagePrice,
                currency: history.currency,
              })}
            />
          )}

          <AppText variant="caption">
            {history.observationCount > 0
              ? history.observationCount +
                " observed price" +
                (history.observationCount === 1 ? "" : "s") +
                " · updated " +
                (history.lastObservedAt
                  ? formatListingRecency(history.lastObservedAt)
                  : "date unavailable") +
                "."
              : "No observed price data is available yet."}{" "}
            History is limited to {formatMarketplaceName(listing.marketplace_id)} and the same
            currency; no conversion is used.
          </AppText>
        </Card>
      )}
    </>
  );
}

function dealIndicatorLabel(indicator: NonNullable<Listing["price_history"]>["dealIndicator"]) {
  switch (indicator) {
    case "below_history":
      return "Below recent history";
    case "above_history":
      return "Above recent history";
    case "typical":
      return "Typical recent price";
    default:
      return "Price history available";
  }
}

function formatPriceRange(lowestPrice: number, highestPrice: number, currency: string) {
  const lowest = formatListingPrice({ price: lowestPrice, currency });
  if (lowestPrice === highestPrice) {
    return lowest;
  }

  return lowest + " – " + formatListingPrice({ price: highestPrice, currency });
}

function Gallery({
  images,
  failedImages,
  currentImage,
  pageWidth,
  onImageChange,
  onImageError,
  title,
}: {
  images: string[];
  failedImages: string[];
  currentImage: number;
  pageWidth: number;
  onImageChange: (index: number) => void;
  onImageError: (image: string) => void;
  title: string;
}) {
  const theme = useTheme();

  if (images.length === 0) {
    return (
      <View className="h-72 items-center justify-center gap-3 rounded-3xl bg-surface-muted">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-background-muted">
          <AppIcon name="image" size={26} color={theme.colors.textTertiary} />
        </View>
        <AppText variant="bodySmall">No images available for this listing.</AppText>
      </View>
    );
  }

  return (
    <View className="-mx-5 overflow-hidden">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          onImageChange(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
        }}
      >
        {images.map((image, index) => (
          <View
            key={image}
            className="h-80 items-center justify-center bg-surface-muted"
            style={{ width: pageWidth }}
          >
            {failedImages.includes(image) ? (
              <View className="items-center gap-2">
                <AppIcon name="image" size={26} color={theme.colors.textTertiary} />
                <AppText variant="caption">Image unavailable</AppText>
              </View>
            ) : (
              <Image
                accessibilityLabel={`${title} image ${index + 1}`}
                className="h-full w-full"
                resizeMode="contain"
                source={{ uri: image }}
                onError={() => onImageError(image)}
              />
            )}
          </View>
        ))}
      </ScrollView>

      <View className="absolute right-4 top-4 rounded-full bg-black/45 px-3 py-1.5">
        <AppText variant="caption" className="font-semibold text-white">
          {Math.min(currentImage + 1, images.length)} / {images.length}
        </AppText>
      </View>

      {images.length > 1 && (
        <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-1.5">
          {images.map((image, index) => (
            <View
              key={image}
              className={`h-1.5 rounded-full ${index === currentImage ? "w-6 bg-primary" : "w-1.5 bg-text-tertiary"}`}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function FavoriteButton({
  isFavorite,
  disabled,
  onPress,
}: {
  isFavorite: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={isFavorite ? "Remove listing favorite" : "Save listing"}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite, disabled }}
      className={`flex-row items-center gap-2 rounded-full px-3 py-2 ${
        isFavorite ? "bg-primary" : "bg-background-muted"
      }`}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
    >
      <AppIcon name="heart" size={17} color={isFavorite ? "white" : theme.colors.textSecondary} />
      <AppText
        variant="bodySmall"
        className={isFavorite ? "font-semibold text-white" : "font-medium text-text-secondary"}
      >
        {isFavorite ? "Saved" : "Save"}
      </AppText>
    </Pressable>
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
