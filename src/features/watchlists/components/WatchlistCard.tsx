import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";

import type { Watchlist } from "../types/watchlist.types";

interface WatchlistCardProps {
  watchlist: Watchlist;
  disabled?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onFavoriteToggle: () => void;
  onPauseToggle: () => void;
}

export function WatchlistCard({
  watchlist,
  disabled = false,
  onDelete,
  onEdit,
  onFavoriteToggle,
  onPauseToggle,
}: WatchlistCardProps) {
  return (
    <Card padding="lg">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <AppText variant="title" numberOfLines={1}>
            {watchlist.name}
          </AppText>
          <AppText variant="caption" className="mt-1">
            {watchlist.is_active ? "Watching" : "Paused"} · Facebook Marketplace
          </AppText>
        </View>

        <Pressable
          accessibilityLabel={watchlist.is_favorite ? "Remove favorite" : "Favorite watchlist"}
          accessibilityRole="button"
          disabled={disabled}
          hitSlop={8}
          onPress={onFavoriteToggle}
        >
          <AppText
            variant="bodySmall"
            className={watchlist.is_favorite ? "font-semibold text-primary" : "text-text-secondary"}
          >
            {watchlist.is_favorite ? "Favorited" : "Favorite"}
          </AppText>
        </Pressable>
      </View>

      <View className="mt-4 rounded-xl bg-background p-3">
        <AppText variant="caption" className="mb-1">
          Search
        </AppText>
        <AppText variant="body" numberOfLines={2}>
          {watchlist.search_query}
        </AppText>
      </View>

      <View className="mt-4 flex-row gap-2">
        <Button disabled={disabled} size="sm" variant="outline" onPress={onEdit}>
          Edit
        </Button>
        <Button disabled={disabled} size="sm" variant="ghost" onPress={onPauseToggle}>
          {watchlist.is_active ? "Pause" : "Resume"}
        </Button>
        <Button disabled={disabled} size="sm" variant="danger" onPress={onDelete}>
          Delete
        </Button>
      </View>
    </Card>
  );
}
