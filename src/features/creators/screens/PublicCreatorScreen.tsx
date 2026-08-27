import { Image, Linking, Share, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { getPublicDealRoomUrl } from "@/features/deal-rooms/services/deal-room.service";
import { AppHeader } from "@/features/navigation/components";
import type { ApiPublicDealRoom, ApiPublicDealRoomItem } from "@/services/api";

import {
  getCreatorErrorMessage,
  getPublicCreatorProfile,
  getPublicCreatorUrl,
  getSavedCreatorCollectionSlugs,
  setCreatorCollectionSaved,
} from "../services/creator.service";

export function PublicCreatorScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const publicSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [actionError, setActionError] = useState<string | null>(null);
  const isValidSlug = Boolean(publicSlug && /^[a-f0-9]{24}$/.test(publicSlug));
  const creatorQuery = useQuery({
    queryKey: ["public-creator", publicSlug],
    queryFn: () => getPublicCreatorProfile(publicSlug!),
    enabled: isValidSlug,
  });
  const savedQueryKey = ["saved-deal-rooms", user?.id] as const;
  const savedQuery = useQuery({
    queryKey: savedQueryKey,
    queryFn: getSavedCreatorCollectionSlugs,
    enabled: Boolean(user),
  });
  const saveMutation = useMutation({
    mutationFn: ({ roomSlug, saved }: { roomSlug: string; saved: boolean }) =>
      setCreatorCollectionSaved(roomSlug, saved),
    onSuccess: (_saved, variables) => {
      queryClient.setQueryData<string[]>(savedQueryKey, (current = []) =>
        variables.saved
          ? [...new Set([...current, variables.roomSlug])]
          : current.filter((slug) => slug !== variables.roomSlug),
      );
      setActionError(null);
    },
    onError: () => setActionError("We couldn't update your saved collections."),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (!isValidSlug) {
    return (
      <ErrorState title="Creator not found" description="That creator profile link is invalid." />
    );
  }

  if (creatorQuery.isLoading) {
    return <Loading />;
  }

  if (creatorQuery.isError || !creatorQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Creator" onBack={() => router.back()} />
          <ErrorState
            title="Creator profile unavailable"
            description={getCreatorErrorMessage(creatorQuery.error)}
          />
          <Button variant="outline" onPress={() => void creatorQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const creator = creatorQuery.data;
  const savedSlugs = new Set(savedQuery.data ?? []);

  function shareCreator() {
    setActionError(null);
    void Share.share({
      title: `Share ${creator.displayName} on DealDrop`,
      message: getPublicCreatorUrl(creator.publicSlug),
    }).catch(() => setActionError("We couldn't open sharing for this creator profile."));
  }

  async function openRoom(room: ApiPublicDealRoom) {
    try {
      await Linking.openURL(getPublicDealRoomUrl(room.publicSlug));
    } catch {
      setActionError("We couldn't open this public collection.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        contentContainerClassName="gap-5 px-5 pb-12 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title="Creator picks" onBack={() => router.back()} />

        <Card padding="lg" className="items-center gap-3 bg-primary-soft">
          <Avatar uri={creator.avatarUrl ?? undefined} fallback={creator.displayName} size="lg" />
          <View className="items-center gap-1">
            <AppText variant="heading" className="text-center">
              {creator.displayName}
            </AppText>
            {creator.bio && (
              <AppText variant="bodySmall" className="text-center">
                {creator.bio}
              </AppText>
            )}
          </View>
          <Button variant="outline" onPress={shareCreator}>
            Share profile
          </Button>
        </Card>

        {actionError && <AppText variant="error">{actionError}</AppText>}

        <View className="gap-1">
          <AppText variant="title">Curated collections</AppText>
          <AppText variant="bodySmall">
            {"Prices and availability reflect DealDrop's latest marketplace observations."}
          </AppText>
        </View>

        {creator.rooms.length === 0 ? (
          <EmptyState
            title="No public collections yet"
            description="This creator is still preparing their first public Deal Room."
          />
        ) : (
          <View className="gap-4">
            {creator.rooms.map((room) => (
              <CreatorCollectionCard
                key={room.publicSlug}
                room={room}
                saved={savedSlugs.has(room.publicSlug)}
                saving={saveMutation.isPending}
                onOpen={() => void openRoom(room)}
                onSave={() =>
                  saveMutation.mutate({
                    roomSlug: room.publicSlug,
                    saved: !savedSlugs.has(room.publicSlug),
                  })
                }
              />
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function CreatorCollectionCard({
  room,
  saved,
  saving,
  onOpen,
  onSave,
}: {
  room: ApiPublicDealRoom;
  saved: boolean;
  saving: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const previewItems = room.items.slice(0, 3);
  const coverImage = room.coverImageUrl ?? previewItems.find((item) => item.imageUrl)?.imageUrl;

  return (
    <Card padding="md" className="gap-4">
      {coverImage && (
        <View className="h-40 overflow-hidden rounded-2xl bg-surface-muted">
          <Image source={{ uri: coverImage }} resizeMode="contain" className="h-full w-full" />
        </View>
      )}
      <View className="gap-1">
        <AppText variant="title">{room.name}</AppText>
        {room.description && <AppText variant="bodySmall">{room.description}</AppText>}
        <AppText variant="caption">
          {room.items.length} {room.items.length === 1 ? "product" : "products"}
        </AppText>
      </View>

      {previewItems.length > 0 && (
        <View className="gap-2 border-t border-border pt-3">
          {previewItems.map((item, index) => (
            <CollectionItemPreview key={`${room.publicSlug}-${index}`} item={item} />
          ))}
        </View>
      )}

      <View className="gap-2">
        <Button variant="secondary" onPress={onOpen}>
          Open collection
        </Button>
        <Button variant="outline" loading={saving} onPress={onSave}>
          {saved ? "Remove from saved" : "Save collection"}
        </Button>
      </View>
    </Card>
  );
}

function CollectionItemPreview({ item }: { item: ApiPublicDealRoomItem }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1">
        <AppText variant="bodySmall" numberOfLines={2}>
          {item.title}
        </AppText>
        <AppText variant="caption">{formatPrice(item.currentPrice, item.currency)}</AppText>
      </View>
      <AppText
        variant="caption"
        className={item.availability === "unavailable" ? "text-error" : "text-text-secondary"}
      >
        {formatAvailability(item.availability)}
      </AppText>
    </View>
  );
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return "Price unavailable";
  if (!currency) return String(price);

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function formatAvailability(availability: ApiPublicDealRoomItem["availability"]) {
  if (availability === "available") return "Available";
  if (availability === "unavailable") return "Sold out / unavailable";
  return "Availability unknown";
}
