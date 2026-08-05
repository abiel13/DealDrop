import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { AppText } from "@/components/ui/Text";

export function NotificationsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="grow px-6 py-8">
        <View>
          <AppText variant="heading" className="mb-3">
            Notifications
          </AppText>
          <AppText variant="body" className="text-text-secondary">
            DealDrop will let you know when a listing matches one of your watchlists.
          </AppText>
        </View>

        <EmptyState
          title="No notifications yet"
          description="New matching listings and alert updates will appear here."
        />
      </ScrollView>
    </SafeAreaView>
  );
}
