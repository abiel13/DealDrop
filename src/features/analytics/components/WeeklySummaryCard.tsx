import { Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";

import type { WeeklySummary } from "../types/analytics.types";

interface WeeklySummaryCardProps {
  summary: WeeklySummary;
  onOpenMatches: () => void;
  onOpenListing: (listingId: string) => void;
  onOpenWatchlist: (watchlistId: string) => void;
}

function formatPeriod(periodStart: string, periodEnd: string) {
  const start = new Date(periodStart).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const end = new Date(periodEnd).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${start} – ${end}`;
}

function SummaryLink({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="rounded-2xl bg-surface-muted px-4 py-3"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between gap-3">
        <AppText variant="label" className="flex-1">
          {label}
        </AppText>
        <AppText variant="title" className="text-primary">
          {detail}
        </AppText>
      </View>
    </Pressable>
  );
}

export function WeeklySummaryCard({
  summary,
  onOpenMatches,
  onOpenListing,
  onOpenWatchlist,
}: WeeklySummaryCardProps) {
  const quietWatchlist = summary.quietWatchlists[0];
  const savedListingId = summary.savedListingIds[0];
  const priceDropListingId = summary.priceDropListingIds[0];

  return (
    <Card padding="md" className="gap-4">
      <View className="gap-1">
        <AppText variant="title">Your weekly summary</AppText>
        <AppText variant="caption">{formatPeriod(summary.periodStart, summary.periodEnd)}</AppText>
      </View>

      {summary.hasActivity ? (
        <View className="gap-2">
          {summary.newMatches > 0 && (
            <SummaryLink
              label="New matches"
              detail={String(summary.newMatches)}
              onPress={onOpenMatches}
            />
          )}
          {summary.savedListings > 0 && savedListingId && (
            <SummaryLink
              label="Saved listings"
              detail={String(summary.savedListings)}
              onPress={() => onOpenListing(savedListingId)}
            />
          )}
          {summary.priceDrops > 0 && priceDropListingId && (
            <SummaryLink
              label="Price drops"
              detail={String(summary.priceDrops)}
              onPress={() => onOpenListing(priceDropListingId)}
            />
          )}
        </View>
      ) : (
        <AppText variant="bodySmall" className="text-text-secondary">
          No new activity in the last 7 days. Your active watchlists are still monitoring.
        </AppText>
      )}

      {quietWatchlist && (
        <Pressable
          accessibilityRole="button"
          className="border-t border-border pt-3"
          onPress={() => onOpenWatchlist(quietWatchlist.id)}
        >
          <AppText variant="label">Quiet watchlist</AppText>
          <AppText variant="bodySmall" className="text-text-secondary">
            {summary.quietWatchlists.length === 1
              ? `${quietWatchlist.name} has no new matches this week. Review it`
              : `${summary.quietWatchlists.length} active watchlists have no new matches this week. Review one`}
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}
