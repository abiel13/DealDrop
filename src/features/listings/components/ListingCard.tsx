import { Image, Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useTheme } from "@/providers/ThemeProvider";

import type { Listing } from "../types/listing.types";
import {
  formatListingPrice,
  formatListingRecency,
  formatMarketplaceName,
} from "../utils/listing.utils";

interface ListingCardProps {
  listing: Listing;
  disabled?: boolean;
  onPress: () => void;
  onFavoriteToggle: () => void;
}

export function ListingCard({
  listing,
  disabled = false,
  onPress,
  onFavoriteToggle,
}: ListingCardProps) {
  const theme = useTheme();

  const image = listing.images[0] ?? listing.image_url;

  return (
    <Pressable
      accessibilityLabel={`Open ${listing.title}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Card padding="none" className="overflow-hidden">
        <View className="h-60 w-full items-center justify-center bg-surface-muted">
          {image ? (
            <Image
              accessibilityLabel={`${listing.title} image`}
              className="h-full w-full"
              resizeMode="contain"
              source={{ uri: image }}
            />
          ) : (
            <View className="items-center gap-2">
              <AppIcon name="image" size={26} color={theme.colors.textTertiary} />
              <AppText variant="caption">No image available</AppText>
            </View>
          )}

          <Pressable
            accessibilityLabel={listing.is_favorite ? "Remove listing favorite" : "Save listing"}
            accessibilityRole="button"
            accessibilityState={{ selected: listing.is_favorite, disabled }}
            className={`absolute right-3 top-3 h-11 w-11 items-center justify-center rounded-full shadow-card ${
              listing.is_favorite ? "bg-primary" : "bg-surface"
            }`}
            disabled={disabled}
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onFavoriteToggle();
            }}
          >
            <AppIcon
              name="heart"
              size={21}
              color={listing.is_favorite ? "white" : theme.colors.textSecondary}
              weight="semibold"
            />
          </Pressable>
        </View>

        <View className="gap-2.5 p-4">
          <AppText variant="heading" className="text-primary">
            {formatListingPrice(listing)}
          </AppText>

          <AppText variant="title" numberOfLines={2}>
            {listing.title}
          </AppText>

          {listing.location && (
            <View className="flex-row items-center gap-1.5">
              <AppIcon name="place" size={15} color={theme.colors.textSecondary} />
              <AppText variant="bodySmall" numberOfLines={1}>
                {listing.location}
              </AppText>
            </View>
          )}

          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-1.5">
              <AppIcon name="storefront" size={14} color={theme.colors.textTertiary} />
              <AppText variant="caption" numberOfLines={1}>
                {formatMarketplaceName(listing.marketplace_id)}
              </AppText>
            </View>
            <AppText variant="caption">
              {formatListingRecency(listing.posted_at ?? listing.matched_at)}
            </AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
