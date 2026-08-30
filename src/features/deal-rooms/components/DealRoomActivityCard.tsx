import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";

import { getDealRoomActivity } from "../services/deal-room.service";
import type { DealRoomActivity } from "../types/deal-room.types";

export function DealRoomActivityCard({ roomId, enabled }: { roomId: string; enabled: boolean }) {
  const activityQuery = useQuery({
    queryKey: ["deal-room-activity", roomId],
    queryFn: () => getDealRoomActivity(roomId),
    enabled,
  });

  const activities = activityQuery.data?.slice(0, 5) ?? [];
  if (activityQuery.isLoading || activities.length === 0) return null;

  return (
    <Card padding="md" className="gap-3">
      <AppText variant="label">Room activity</AppText>
      <View className="gap-2">
        {activities.map((activity) => (
          <View key={activity.id} className="flex-row gap-2">
            <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            <AppText variant="caption" className="flex-1 text-text-secondary">
              {describeActivity(activity)}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function describeActivity(activity: DealRoomActivity) {
  const actor = activity.actorName ?? "Someone";
  switch (activity.eventType) {
    case "member_invited":
      return `${actor} invited ${stringMetadata(activity.metadata.email, "a collaborator")}.`;
    case "member_joined":
      return `${actor} joined the room.`;
    case "item_added":
      return `${actor} added a product to the room.`;
    case "item_shortlisted":
      return `${actor} ${activity.metadata.isShortlisted ? "shortlisted" : "removed"} a product.`;
    case "vote_cast":
      return `${actor} ${activity.metadata.prefer ? "preferred" : "removed their preference from"} a product.`;
    case "comment_added":
      return `${actor} added a product comment.`;
    default:
      return `${actor} updated the room.`;
  }
}

function stringMetadata(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
