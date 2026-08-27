import { Share, Switch, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, creatorRoute } from "@/features/auth/routes";
import { getDealRooms } from "@/features/deal-rooms/services/deal-room.service";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";

import {
  getCreatorProfile,
  getPublicCreatorUrl,
  saveCreatorProfile,
} from "../services/creator.service";
import type { CreatorProfile } from "../types/creator.types";

export function CreatorProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const profileQueryKey = ["creator-profile", user?.id] as const;
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getCreatorProfile,
    enabled: Boolean(user),
  });
  const roomsQuery = useQuery({
    queryKey: ["deal-rooms", user?.id],
    queryFn: getDealRooms,
    enabled: Boolean(user),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (profileQuery.isLoading) {
    return <Loading />;
  }

  if (profileQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Creator profile" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't load your creator profile"
            description="Check your connection and try again."
          />
          <Button variant="outline" onPress={() => void profileQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const fallbackName = metadataName?.trim() || user.email?.split("@")[0] || "DealDrop creator";
  const publicRoomCount =
    roomsQuery.data?.filter((room) => room.visibility === "public" && room.role === "owner")
      .length ?? 0;

  return (
    <CreatorProfileForm
      key={profileQuery.data?.updatedAt ?? "new-creator-profile"}
      profile={profileQuery.data ?? null}
      fallbackName={fallbackName}
      publicRoomCount={publicRoomCount}
      onBack={() => router.back()}
      onManageRooms={() => router.push(authRoutes.dealRooms)}
      onViewPublicProfile={(slug) => router.push(creatorRoute(slug))}
      onSaved={(profile) => queryClient.setQueryData(profileQueryKey, profile)}
    />
  );
}

function CreatorProfileForm({
  profile,
  fallbackName,
  publicRoomCount,
  onBack,
  onManageRooms,
  onViewPublicProfile,
  onSaved,
}: {
  profile: CreatorProfile | null;
  fallbackName: string;
  publicRoomCount: number;
  onBack: () => void;
  onManageRooms: () => void;
  onViewPublicProfile: (publicSlug: string) => void;
  onSaved: (profile: CreatorProfile) => void;
}) {
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? fallbackName);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const avatarUrlValid = !avatarUrl.trim() || /^https?:\/\/\S+$/i.test(avatarUrl.trim());
  const canSave = displayName.trim().length >= 2 && avatarUrlValid;
  const mutation = useMutation({
    mutationFn: saveCreatorProfile,
    onSuccess: (savedProfile) => {
      setActionError(null);
      onSaved(savedProfile);
    },
    onError: () => setActionError("We couldn't save your creator profile. Please try again."),
  });

  function shareProfile() {
    if (!profile?.isPublic) return;
    setShareError(null);
    void Share.share({
      title: `Share ${profile.displayName} on DealDrop`,
      message: getPublicCreatorUrl(profile.publicSlug),
    }).catch(() => setShareError("We couldn't open sharing for this profile."));
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        contentContainerClassName="gap-5 px-5 pb-12 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Creator profile"
          subtitle="Curate useful public product collections"
          onBack={onBack}
        />

        <Card padding="md" className="gap-3 bg-primary-soft">
          <AppText variant="title">Your public DealDrop identity</AppText>
          <AppText variant="bodySmall">
            Public Deal Rooms appear here with the latest price and availability DealDrop has
            observed. This does not create a social feed or expose your account email.
          </AppText>
        </Card>

        <View className="items-center gap-2 py-2">
          <Avatar
            uri={avatarUrl.trim() || undefined}
            fallback={displayName || fallbackName}
            size="lg"
          />
          <AppText variant="caption">Creator avatar preview</AppText>
        </View>

        <Card padding="md" className="gap-4">
          <Input
            label="Public display name"
            value={displayName}
            maxLength={80}
            onChangeText={setDisplayName}
          />
          <View className="gap-1">
            <Input
              label="Avatar image URL"
              value={avatarUrl}
              maxLength={2048}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://…"
              onChangeText={setAvatarUrl}
            />
            {!avatarUrlValid && (
              <AppText variant="error">Use a complete http or https image URL.</AppText>
            )}
          </View>
          <Input
            label="Short bio"
            value={bio}
            maxLength={240}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="What kinds of products do you curate?"
            onChangeText={setBio}
          />

          <View className="flex-row items-center gap-3 rounded-2xl bg-background-muted p-4">
            <View className="flex-1 gap-1">
              <AppText className="font-semibold text-text">Public profile</AppText>
              <AppText variant="caption">
                When disabled, your creator URL and public collections are hidden.
              </AppText>
            </View>
            <Switch
              accessibilityLabel="Make creator profile public"
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: theme.colors.backgroundMuted, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>

          {actionError && <AppText variant="error">{actionError}</AppText>}
          <Button
            loading={mutation.isPending}
            disabled={!canSave}
            onPress={() =>
              mutation.mutate({
                displayName,
                avatarUrl: avatarUrl || null,
                bio: bio || null,
                isPublic,
              })
            }
          >
            {profile ? "Save creator profile" : "Create creator profile"}
          </Button>
        </Card>

        <Card padding="md" className="gap-3">
          <View className="gap-1">
            <AppText variant="title">Public collections</AppText>
            <AppText variant="bodySmall">
              {publicRoomCount === 0
                ? "Make a Deal Room public to add the first collection to your creator page."
                : `${publicRoomCount} public ${publicRoomCount === 1 ? "collection" : "collections"} will appear on your creator page.`}
            </AppText>
          </View>
          <Button variant="outline" onPress={onManageRooms}>
            Manage Deal Rooms
          </Button>
        </Card>

        {profile?.isPublic && (
          <Card padding="md" className="gap-3">
            <AppText variant="title">Your shareable profile</AppText>
            <AppText variant="caption" numberOfLines={2}>
              {getPublicCreatorUrl(profile.publicSlug)}
            </AppText>
            <View className="gap-2">
              <Button variant="secondary" onPress={() => onViewPublicProfile(profile.publicSlug)}>
                Preview public profile
              </Button>
              <Button variant="outline" onPress={shareProfile}>
                Share creator profile
              </Button>
            </View>
            {shareError && <AppText variant="error">{shareError}</AppText>}
          </Card>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
