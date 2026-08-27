import { Image, Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { useTheme } from "@/providers/ThemeProvider";

import type { DealRoom } from "../types/deal-room.types";

interface DealRoomCardProps {
  room: DealRoom;
  onPress: () => void;
}

export function DealRoomCard({ room, onPress }: DealRoomCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={`Open ${room.name} Deal Room`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Card padding="none" className="overflow-hidden">
        <View className="h-36 items-center justify-center bg-primary-soft">
          {room.coverImageUrl ? (
            <Image
              accessibilityLabel={`${room.name} cover`}
              className="h-full w-full"
              resizeMode="cover"
              source={{ uri: room.coverImageUrl }}
            />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-3xl bg-surface">
              <AppIcon name="image" size={28} color={theme.colors.primary} weight="semibold" />
            </View>
          )}
          <View className="absolute bottom-3 left-3 flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
            <AppIcon
              name={room.visibility === "public" ? "person" : "lock"}
              size={14}
              color={theme.colors.primary}
            />
            <AppText variant="caption" className="font-semibold text-primary">
              {room.visibility === "public" ? "Public" : "Private"}
            </AppText>
          </View>
        </View>

        <View className="gap-2.5 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <AppText variant="title" className="flex-1" numberOfLines={2}>
              {room.name}
            </AppText>
            <AppIcon name="arrow-forward" size={18} color={theme.colors.textTertiary} />
          </View>
          {room.description && (
            <AppText variant="bodySmall" numberOfLines={2}>
              {room.description}
            </AppText>
          )}
          <AppText variant="caption" className="text-text-secondary">
            {room.items.length} {room.items.length === 1 ? "item" : "items"}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}
