import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";

import {
  addDealRoomComment,
  getDealRoomComments,
  getDealRoomErrorMessage,
  removeDealRoomComment,
} from "../services/deal-room.service";

interface DealRoomCommentsProps {
  roomId: string;
  itemId: string;
  userId: string;
  canComment: boolean;
}

export function DealRoomComments({ roomId, itemId, userId, canComment }: DealRoomCommentsProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const commentsQuery = useQuery({
    queryKey: ["deal-room-comments", roomId, itemId],
    queryFn: () => getDealRoomComments(roomId, itemId),
  });
  const addMutation = useMutation({
    mutationFn: () => addDealRoomComment(roomId, itemId, body),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["deal-room-comments", roomId, itemId] });
      void queryClient.invalidateQueries({ queryKey: ["deal-room-activity", roomId] });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (commentId: string) => removeDealRoomComment(roomId, itemId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal-room-comments", roomId, itemId] });
    },
  });
  const error = commentsQuery.error ?? addMutation.error ?? removeMutation.error;

  return (
    <View className="gap-3 rounded-2xl bg-background-muted p-3">
      <AppText variant="label">Product discussion</AppText>
      {commentsQuery.isLoading ? (
        <AppText variant="caption" className="text-text-secondary">
          Loading comments…
        </AppText>
      ) : commentsQuery.data?.length ? (
        commentsQuery.data.map((comment) => (
          <View key={comment.id} className="gap-1 border-t border-border pt-2">
            <View className="flex-row items-center justify-between gap-2">
              <AppText variant="caption" className="font-semibold">
                {comment.authorName ?? "DealDrop member"}
              </AppText>
              {comment.userId === userId && (
                <Pressable
                  accessibilityRole="button"
                  disabled={removeMutation.isPending}
                  onPress={() => removeMutation.mutate(comment.id)}
                >
                  <AppText variant="caption" className="text-text-secondary">
                    Remove
                  </AppText>
                </Pressable>
              )}
            </View>
            <AppText variant="bodySmall">{comment.body}</AppText>
          </View>
        ))
      ) : (
        <AppText variant="caption" className="text-text-secondary">
          No product decisions yet.
        </AppText>
      )}

      {canComment ? (
        <View className="gap-2">
          <Input
            accessibilityLabel="Product comment"
            placeholder="Add a note about this product"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            className="min-h-12"
          />
          <Button
            size="sm"
            loading={addMutation.isPending}
            disabled={!body.trim()}
            onPress={() => addMutation.mutate()}
          >
            Add comment
          </Button>
        </View>
      ) : (
        <AppText variant="caption" className="text-text-secondary">
          Join this room to add a product comment.
        </AppText>
      )}

      {error && (
        <AppText variant="error" className="text-xs">
          {getDealRoomErrorMessage(error)}
        </AppText>
      )}
    </View>
  );
}
