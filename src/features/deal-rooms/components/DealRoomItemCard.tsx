import { Image, Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useTheme } from "@/providers/ThemeProvider";

import type { DealRoomItem } from "../types/deal-room.types";

interface DealRoomItemCardProps {
  item: DealRoomItem;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canRemove: boolean;
  canReplace: boolean;
  onReplace: () => void;
  canVote: boolean;
  canShortlist: boolean;
  onVote: () => void;
  onToggleShortlist: () => void;
  onComments: () => void;
}

export function DealRoomItemCard({
  item,
  disabled = false,
  canMoveUp,
  canMoveDown,
  onOpen,
  onMoveUp,
  onMoveDown,
  onRemove,
  canRemove,
  canReplace,
  onReplace,
  canVote,
  canShortlist,
  onVote,
  onToggleShortlist,
  onComments,
}: DealRoomItemCardProps) {
  const theme = useTheme();

  return (
    <Card padding="md" className="gap-3">
      <Pressable
        accessibilityLabel={`Open ${item.title}`}
        accessibilityRole="button"
        className="flex-row gap-3"
        disabled={!item.listingId}
        onPress={onOpen}
      >
        <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-surface-muted">
          {item.imageUrl ? (
            <Image
              accessibilityLabel={`${item.title} image`}
              className="h-full w-full"
              resizeMode="contain"
              source={{ uri: item.imageUrl }}
            />
          ) : (
            <AppIcon name="image" size={22} color={theme.colors.textTertiary} />
          )}
        </View>

        <View className="flex-1 gap-1">
          <AppText variant="title" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="caption" className="text-text-secondary">
            {getItemTypeLabel(item.itemType)}
            {item.source ? ` · ${formatSource(item.source)}` : ""}
          </AppText>
          <View className="flex-row items-center justify-between gap-2">
            <AppText variant="bodySmall" className="font-semibold text-primary">
              {formatPrice(item.currentPrice, item.currency)}
            </AppText>
            <AppText
              variant="caption"
              className={item.availability === "available" ? "text-primary" : "text-text-secondary"}
            >
              {formatAvailability(item.availability)}
            </AppText>
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            {canVote && (
              <ItemAction
                label={item.viewerVoted ? "Preferred" : "Prefer"}
                icon="star"
                disabled={disabled}
                onPress={onVote}
                selected={item.viewerVoted}
              />
            )}
            {canShortlist && (
              <ItemAction
                label={item.isShortlisted ? "Shortlisted" : "Shortlist"}
                icon="check"
                disabled={disabled}
                onPress={onToggleShortlist}
                selected={item.isShortlisted}
              />
            )}
            <ItemAction label="Comments" icon="info" disabled={disabled} onPress={onComments} />
            <AppText variant="caption" className="text-text-secondary">
              {item.voteCount} {item.voteCount === 1 ? "preference" : "preferences"}
            </AppText>
          </View>
        </View>
      </Pressable>

      <View className="flex-row flex-wrap items-center gap-2 border-t border-border pt-3">
        <ItemAction
          label="Move up"
          icon="sort"
          disabled={disabled || !canMoveUp}
          onPress={onMoveUp}
        />
        <ItemAction
          label="Move down"
          icon="sort"
          disabled={disabled || !canMoveDown}
          onPress={onMoveDown}
        />
        {canReplace && (
          <ItemAction label="Replace" icon="refresh" disabled={disabled} onPress={onReplace} />
        )}
        <ItemAction
          label="Remove"
          icon="delete"
          disabled={disabled || !canRemove}
          onPress={onRemove}
          destructive
        />
      </View>
    </Card>
  );
}

function ItemAction({
  label,
  icon,
  disabled,
  onPress,
  destructive = false,
  selected = false,
}: {
  label: string;
  icon: "check" | "delete" | "info" | "refresh" | "sort" | "star";
  disabled: boolean;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`flex-row items-center gap-1 rounded-full px-3 py-2 ${
        destructive ? "bg-background-muted" : selected ? "bg-primary" : "bg-primary-soft"
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <AppIcon
        name={icon}
        size={15}
        color={
          disabled
            ? theme.colors.textTertiary
            : selected
              ? "white"
              : destructive
                ? theme.colors.textSecondary
                : theme.colors.primary
        }
      />
      <AppText
        variant="caption"
        className={
          disabled
            ? "text-text-tertiary"
            : selected
              ? "font-semibold text-white"
              : destructive
                ? "text-text-secondary"
                : "font-semibold text-primary"
        }
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function getItemTypeLabel(itemType: DealRoomItem["itemType"]) {
  switch (itemType) {
    case "tracked_product":
      return "Tracked product";
    case "saved_product":
      return "Saved product";
    case "selected_deal":
      return "Selected deal";
    case "marketplace_listing":
      return "Marketplace listing";
    default:
      return "Product";
  }
}

function formatSource(source: string) {
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) {
    return "Price unavailable";
  }

  if (!currency) {
    return String(price);
  }

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function formatAvailability(availability: DealRoomItem["availability"]) {
  if (availability === "available") return "Available";
  if (availability === "unavailable") return "Unavailable";
  return "Availability unknown";
}
