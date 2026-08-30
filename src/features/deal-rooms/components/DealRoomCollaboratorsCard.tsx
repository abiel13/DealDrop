import { Share, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";

import {
  getDealRoomMembers,
  getDealRoomErrorMessage,
  inviteToDealRoom,
} from "../services/deal-room.service";
import type { DealRoom, DealRoomRole } from "../types/deal-room.types";

export function DealRoomCollaboratorsCard({ room }: { room: DealRoom }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<DealRoomRole, "owner">>("viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const membersQuery = useQuery({
    queryKey: ["deal-room-members", room.id],
    queryFn: () => getDealRoomMembers(room.id),
    enabled: room.isMember,
  });
  const inviteMutation = useMutation({
    mutationFn: () => inviteToDealRoom(room.id, email, role),
    onSuccess: (invitation) => {
      setEmail("");
      setInviteError(null);
      void queryClient.invalidateQueries({ queryKey: ["deal-room-members", room.id] });
      void Share.share({
        message: invitation.inviteUrl,
        title: `Join ${room.name} on DealDrop`,
      }).catch((error: unknown) => setInviteError(getDealRoomErrorMessage(error)));
    },
    onError: (error) => setInviteError(getDealRoomErrorMessage(error)),
  });

  return (
    <Card padding="md" className="gap-3">
      <View className="gap-1">
        <AppText variant="label">Collaborators</AppText>
        <AppText variant="bodySmall">
          {room.memberCount} {room.memberCount === 1 ? "person" : "people"} can work on this room.
          Product decisions stay focused on the collection.
        </AppText>
      </View>

      {membersQuery.data?.map((member) => (
        <View key={member.userId} className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <AppText className="font-semibold">
              {member.fullName ?? member.email ?? "DealDrop member"}
            </AppText>
            {member.fullName && member.email && (
              <AppText variant="caption" className="text-text-secondary">
                {member.email}
              </AppText>
            )}
          </View>
          <AppText variant="caption" className="text-text-secondary">
            {formatRole(member.role)}
          </AppText>
        </View>
      ))}

      {room.role === "owner" && (
        <View className="gap-3 border-t border-border pt-3">
          <AppText variant="label">Invite someone</AppText>
          <Input
            label="DealDrop email"
            placeholder="friend@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View className="flex-row gap-2">
            <RoleButton
              label="Contributor"
              selected={role === "contributor"}
              onPress={() => setRole("contributor")}
            />
            <RoleButton
              label="Viewer"
              selected={role === "viewer"}
              onPress={() => setRole("viewer")}
            />
          </View>
          <Button
            size="sm"
            loading={inviteMutation.isPending}
            disabled={!email.trim()}
            onPress={() => inviteMutation.mutate()}
          >
            Create invite link
          </Button>
          <AppText variant="caption" className="text-text-secondary">
            The link expires in 7 days and only works for the invited DealDrop account.
          </AppText>
        </View>
      )}

      {inviteError && <AppText variant="error">{inviteError}</AppText>}
    </Card>
  );
}

function RoleButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button size="sm" variant={selected ? "primary" : "outline"} onPress={onPress}>
      {label}
    </Button>
  );
}

function formatRole(role: DealRoomRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
