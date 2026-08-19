import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import type { Watchlist } from "../types/watchlist.types";
import { useTheme } from "@/providers/ThemeProvider";

interface FirstWatchlistSuccessProps {
  watchlist: Watchlist;
  onOpenWatchlist: () => void;
  onBackToWatchlists: () => void;
}

export function FirstWatchlistSuccess({
  watchlist,
  onOpenWatchlist,
  onBackToWatchlists,
}: FirstWatchlistSuccessProps) {
  const theme = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="grow gap-5 px-5 pb-8 pt-10">
        <View className="items-center gap-4 pt-8">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-primary">
            <AppIcon name="check" size={32} color={theme.colors.surface} weight="bold" />
          </View>
          <View className="items-center gap-2">
            <AppText variant="display" className="text-center">
              Your watchlist is ready
            </AppText>
            <AppText variant="body" className="text-center text-text-secondary">
              DealDrop will check for new matches on the next monitoring run and keep this search
              active for you.
            </AppText>
          </View>
        </View>

        <Card padding="md" className="gap-3 bg-primary-soft">
          <AppText
            variant="caption"
            className="font-semibold uppercase tracking-[1.5px] text-primary"
          >
            First watchlist
          </AppText>
          <AppText variant="title">{watchlist.name}</AppText>
          <AppText variant="bodySmall">Searching for “{watchlist.search_query}”.</AppText>
          <AppText variant="bodySmall" className="text-text-secondary">
            If the first check has no matches, nothing is wrong — the watchlist will continue
            checking and alert you when something qualifies.
          </AppText>
        </Card>

        <View className="gap-3">
          <Button onPress={onOpenWatchlist}>View this watchlist</Button>
          <Button variant="outline" onPress={onBackToWatchlists}>
            Back to watchlists
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
