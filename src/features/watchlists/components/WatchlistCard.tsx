import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { appColors } from "@/styles/colors";

import type { Watchlist } from "../types/watchlist.types";

interface WatchlistCardProps {
  watchlist: Watchlist;
  disabled?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onFavoriteToggle: () => void;
  onPauseToggle: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAmount(value: number, currency: string | undefined) {
  if (!currency) {
    return value.toLocaleString();
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function getFilterSummary(filters: Record<string, unknown>) {
  const summary: string[] = [];
  const price = isRecord(filters.price) ? filters.price : null;
  const currency = typeof price?.currency === "string" ? price.currency : undefined;
  const minimum = typeof price?.min === "number" && Number.isFinite(price.min) ? price.min : null;
  const maximum = typeof price?.max === "number" && Number.isFinite(price.max) ? price.max : null;

  if (minimum !== null && maximum !== null) {
    summary.push(`${formatAmount(minimum, currency)}–${formatAmount(maximum, currency)}`);
  } else if (minimum !== null) {
    summary.push(`From ${formatAmount(minimum, currency)}`);
  } else if (maximum !== null) {
    summary.push(`Up to ${formatAmount(maximum, currency)}`);
  }

  const distance = isRecord(filters.distance) ? filters.distance : null;
  if (typeof distance?.maxKm === "number" && Number.isFinite(distance.maxKm)) {
    summary.push(`${distance.maxKm} km radius`);
  }

  if (Array.isArray(filters.conditions)) {
    const conditions = filters.conditions.filter(
      (condition): condition is string => typeof condition === "string" && condition.length > 0,
    );
    if (conditions.length > 0) {
      summary.push(conditions.join(", "));
    }
  }

  return summary.length > 0 ? summary : ["No extra filters"];
}

function formatLastChecked(value: string | null) {
  if (!value) {
    return "Not checked yet";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Not checked yet";
  }

  return `Last checked ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function WatchlistCard({
  watchlist,
  disabled = false,
  onDelete,
  onEdit,
  onFavoriteToggle,
  onPauseToggle,
}: WatchlistCardProps) {
  const filterSummary = getFilterSummary(watchlist.filters);

  return (
    <Card padding="none" className="overflow-hidden">
      <View className={watchlist.is_active ? "bg-primary-soft p-4" : "bg-background-muted p-4"}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-2">
            <View className="flex-row items-center gap-2">
              <View
                className={`h-2.5 w-2.5 rounded-full ${
                  watchlist.is_active ? "bg-success" : "bg-text-tertiary"
                }`}
              />
              <AppText
                variant="caption"
                className={`font-semibold uppercase tracking-[1.5px] ${
                  watchlist.is_active ? "text-success" : "text-text-secondary"
                }`}
              >
                {watchlist.is_active ? "Active" : "Paused"}
              </AppText>
            </View>
            <AppText variant="title" numberOfLines={2}>
              {watchlist.name}
            </AppText>
          </View>

          <Pressable
            accessibilityLabel={watchlist.is_favorite ? "Remove favorite" : "Favorite watchlist"}
            accessibilityRole="button"
            accessibilityState={{ selected: watchlist.is_favorite, disabled }}
            className={`h-11 w-11 items-center justify-center rounded-full ${
              watchlist.is_favorite ? "bg-primary" : "bg-surface"
            }`}
            disabled={disabled}
            hitSlop={8}
            onPress={onFavoriteToggle}
          >
            <AppIcon
              name="heart"
              size={20}
              color={watchlist.is_favorite ? "white" : appColors.textSecondary}
              weight="semibold"
            />
          </Pressable>
        </View>
      </View>

      <View className="gap-4 p-4">
        <View className="gap-2">
          <AppText variant="caption" className="font-semibold uppercase tracking-[1px]">
            Search term
          </AppText>
          <View className="flex-row items-center gap-2">
            <AppIcon name="search" size={17} color={appColors.primary} />
            <AppText variant="subtitle" className="flex-1" numberOfLines={2}>
              {watchlist.search_query}
            </AppText>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <SummaryPill icon="storefront" label="Facebook Marketplace" />
          {filterSummary.map((summary) => (
            <SummaryPill key={summary} label={summary} />
          ))}
        </View>

        <View className="flex-row items-center gap-2">
          <AppIcon name="refresh" size={15} color={appColors.textTertiary} />
          <AppText variant="caption">{formatLastChecked(watchlist.last_checked_at)}</AppText>
        </View>

        <View className="flex-row gap-2">
          <Button
            disabled={disabled}
            size="sm"
            variant="outline"
            className="flex-1"
            onPress={onEdit}
          >
            Edit
          </Button>
          <Button
            disabled={disabled}
            size="sm"
            variant="secondary"
            className="flex-1"
            onPress={onPauseToggle}
          >
            {watchlist.is_active ? "Pause" : "Resume"}
          </Button>
          <Button
            disabled={disabled}
            size="sm"
            variant="danger"
            className="flex-1"
            onPress={onDelete}
          >
            Delete
          </Button>
        </View>
      </View>
    </Card>
  );
}

function SummaryPill({ icon, label }: { icon?: "storefront"; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-background-muted px-3 py-2">
      {icon && <AppIcon name={icon} size={14} color={appColors.textSecondary} />}
      <AppText variant="caption" className="font-medium text-text-secondary">
        {label}
      </AppText>
    </View>
  );
}
