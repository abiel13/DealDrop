import { Image, Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";

import type { Listing } from "../types/listing.types";
import { formatListingDate, formatListingPrice } from "../utils/listing.utils";

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
  return (
    <Pressable
      accessibilityLabel={`Open ${listing.title}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
    >
      <Card padding="md" className="gap-3">
        {listing.image_url ? (
          <Image
            accessibilityLabel={`${listing.title} image`}
            className="h-48 w-full rounded-xl bg-background"
            resizeMode="cover"
            source={{ uri: listing.image_url }}
          />
        ) : (
          <View className="h-32 items-center justify-center rounded-xl bg-background">
            <AppText variant="caption">No image available</AppText>
          </View>
        )}

        <View className="gap-2">
          <View className="flex-row items-start justify-between gap-3">
            <AppText variant="title" className="flex-1" numberOfLines={2}>
              {listing.title}
            </AppText>
            <Pressable
              accessibilityLabel={
                listing.is_favorite ? "Remove listing favorite" : "Favorite listing"
              }
              accessibilityRole="button"
              disabled={disabled}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onFavoriteToggle();
              }}
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

          <View className="flex-row flex-wrap gap-x-2 gap-y-1">
            {listing.location && <AppText variant="bodySmall">{listing.location}</AppText>}
            {listing.condition && <AppText variant="bodySmall">{listing.condition}</AppText>}
            {listing.category && <AppText variant="bodySmall">{listing.category}</AppText>}
          </View>

          <AppText variant="caption">
            {listing.seller_name ? `${listing.seller_name} · ` : ""}
            Listed {formatListingDate(listing.posted_at ?? listing.matched_at)}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}
