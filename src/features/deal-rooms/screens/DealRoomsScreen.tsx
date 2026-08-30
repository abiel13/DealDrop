import { FlatList, RefreshControl, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, dealRoomFormRoute, dealRoomRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";

import { DealRoomCard } from "../components/DealRoomCard";
import { getDealRoomErrorMessage, getDealRooms } from "../services/deal-room.service";

export function DealRoomsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const roomsQuery = useQuery({
    queryKey: ["deal-rooms", user?.id],
    queryFn: getDealRooms,
    enabled: Boolean(user),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (roomsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader
            title="Deal Rooms"
            subtitle="Organize products and deals around the things you care about."
            onBack={() => router.back()}
          />
          <ErrorState
            title="Couldn't load Deal Rooms"
            description={getDealRoomErrorMessage(roomsQuery.error)}
          />
          <Button variant="outline" onPress={() => void roomsQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={roomsQuery.data ?? []}
        keyExtractor={(room) => room.id}
        contentContainerClassName="grow gap-4 px-5 pb-10 pt-6"
        refreshControl={
          <RefreshControl
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
            refreshing={roomsQuery.isRefetching}
            tintColor={theme.colors.primary}
            onRefresh={() => void roomsQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-1 gap-5">
            <AppHeader
              title="Deal Rooms"
              subtitle="Organize products and deals around the things you care about."
              onBack={() => router.back()}
            />
            <Button onPress={() => router.push(dealRoomFormRoute())}>Create a Deal Room</Button>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Start a collection"
            description="Create a room for a gift list, setup, restock, or any shopping plan."
          />
        }
        renderItem={({ item }) => (
          <DealRoomCard room={item} onPress={() => router.push(dealRoomRoute(item.id))} />
        )}
      />
    </SafeAreaView>
  );
}
