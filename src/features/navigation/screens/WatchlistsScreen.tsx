import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { AppText } from "@/components/ui/Text";

export function WatchlistsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="grow px-6 py-8">
        <View>
          <AppText variant="heading" className="mb-3">
            Watchlists
          </AppText>
          <AppText variant="body" className="text-text-secondary">
            Save a search and DealDrop will watch the marketplace for matching listings.
          </AppText>
        </View>

        <EmptyState
          title="No watchlists yet"
          description="Your saved marketplace searches will appear here."
        />
      </ScrollView>
    </SafeAreaView>
  );
}
