import { Alert, Pressable, Share, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, listingRoute } from "@/features/auth/routes";
import { getSavedListings } from "@/features/listings/services/listing.service";
import type { Listing } from "@/features/listings/types/listing.types";
import { getWatchlists } from "@/features/watchlists/services/watchlist.service";
import type { Watchlist } from "@/features/watchlists/types/watchlist.types";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";

import { DealRoomCollaboratorsCard } from "../components/DealRoomCollaboratorsCard";
import { DealRoomComments } from "../components/DealRoomComments";
import { DealRoomActivityCard } from "../components/DealRoomActivityCard";
import { DealRoomItemCard } from "../components/DealRoomItemCard";
import {
  addDealRoomItem,
  deleteDealRoom,
  getDealRoom,
  getDealRoomErrorMessage,
  getPublicDealRoomUrl,
  removeDealRoomItem,
  reorderDealRoomItem,
  setDealRoomItemShortlisted,
  voteForDealRoomItem,
} from "../services/deal-room.service";
import type { DealRoomItem, DealRoomItemInput } from "../types/deal-room.types";

export function DealRoomDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"saved_product" | "selected_deal" | "tracked_product">(
    "saved_product",
  );
  const [operationError, setOperationError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [expandedCommentsItemId, setExpandedCommentsItemId] = useState<string | null>(null);

  const roomQuery = useQuery({
    queryKey: ["deal-room", user?.id, roomId],
    queryFn: () => getDealRoom(roomId!),
    enabled: Boolean(user && roomId),
  });
  const savedListingsQuery = useQuery({
    queryKey: ["deal-room-saved-listings", user?.id],
    queryFn: () => getSavedListings({ limit: 50 }),
    enabled: Boolean(user && showAddPanel && addMode !== "tracked_product"),
  });
  const watchlistsQuery = useQuery({
    queryKey: ["deal-room-watchlists", user?.id],
    queryFn: getWatchlists,
    enabled: Boolean(user && showAddPanel && addMode === "tracked_product"),
  });

  const addMutation = useMutation({
    mutationFn: (input: DealRoomItemInput) => addDealRoomItem(roomId!, input),
    onSuccess: () => {
      setOperationError(null);
      void roomQuery.refetch();
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });
  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeDealRoomItem(roomId!, itemId),
    onSuccess: () => {
      setOperationError(null);
      void roomQuery.refetch();
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: async ({ current, target }: { current: DealRoomItem; target: DealRoomItem }) => {
      await reorderDealRoomItem(roomId!, current.id, target.sortOrder);
      await reorderDealRoomItem(roomId!, target.id, current.sortOrder);
    },
    onSuccess: () => {
      setOperationError(null);
      void roomQuery.refetch();
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteDealRoom(roomId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deal-rooms", user?.id] });
      router.replace(authRoutes.dealRooms);
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });
  const shortlistMutation = useMutation({
    mutationFn: ({ itemId, isShortlisted }: { itemId: string; isShortlisted: boolean }) =>
      setDealRoomItemShortlisted(roomId!, itemId, isShortlisted),
    onSuccess: () => {
      setOperationError(null);
      void roomQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["deal-room-activity", roomId] });
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });
  const voteMutation = useMutation({
    mutationFn: ({ itemId, prefer }: { itemId: string; prefer: boolean }) =>
      voteForDealRoomItem(roomId!, itemId, prefer),
    onSuccess: () => {
      setOperationError(null);
      void roomQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["deal-room-activity", roomId] });
    },
    onError: (error) => setOperationError(getDealRoomErrorMessage(error)),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (!roomId) {
    return <ErrorState title="Deal Room not found" description="That room link is invalid." />;
  }

  if (roomQuery.isLoading) {
    return <Loading />;
  }

  if (roomQuery.isError || !roomQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Deal Room" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't load this Deal Room"
            description={getDealRoomErrorMessage(roomQuery.error)}
          />
          <Button variant="outline" onPress={() => void roomQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const room = roomQuery.data;
  const items = room.items;
  const isMutating =
    addMutation.isPending ||
    removeMutation.isPending ||
    reorderMutation.isPending ||
    deleteMutation.isPending ||
    shortlistMutation.isPending ||
    voteMutation.isPending;
  const selectableListings = savedListingsQuery.data?.listings ?? [];
  const canContribute = room.role === "owner" || room.role === "contributor";
  const canComment = room.isMember && room.role !== "viewer";

  function confirmRemove(item: DealRoomItem) {
    Alert.alert("Remove from room?", `Remove “${item.title}” from ${room.name}?`, [
      { text: "Keep item", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeMutation.mutate(item.id),
      },
    ]);
  }

  function confirmDeleteRoom() {
    Alert.alert("Delete Deal Room?", `“${room.name}” and its collection will be removed.`, [
      { text: "Keep room", style: "cancel" },
      {
        text: "Delete room",
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  }

  function sharePublicRoom() {
    setShareError(null);
    void Share.share({
      message: getPublicDealRoomUrl(room.publicSlug),
      title: `Share ${room.name} on DealDrop`,
    }).catch(() => setShareError("We couldn't open sharing for this room."));
  }

  function selectListing(listing: Listing) {
    addMutation.mutate({ itemType: addMode, listingId: listing.id });
  }

  function selectWatchlist(watchlist: Watchlist) {
    addMutation.mutate({ itemType: "tracked_product", watchlistId: watchlist.id });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;
    reorderMutation.mutate({ current, target });
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        contentContainerClassName="gap-5 px-5 pb-10 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title={room.name}
          subtitle={`${room.visibility === "public" ? "Public" : "Private"} collection · ${items.length} ${items.length === 1 ? "item" : "items"} · ${room.role}`}
          onBack={() => router.back()}
        />

        {room.description && (
          <Card padding="md" className="bg-primary-soft">
            <AppText variant="bodySmall">{room.description}</AppText>
          </Card>
        )}

        {room.visibility === "public" && (
          <Card padding="md" className="gap-3">
            <View className="gap-1">
              <AppText variant="label">Share this Deal Room</AppText>
              <AppText variant="bodySmall">
                Anyone with the link can view this collection without the app.
              </AppText>
            </View>
            <Button variant="outline" onPress={sharePublicRoom}>
              Share public link
            </Button>
            {shareError && <AppText variant="error">{shareError}</AppText>}
          </Card>
        )}

        {canContribute && (
          <Button
            leftIcon={<AppIcon name="star" size={18} color="white" />}
            onPress={() => setShowAddPanel((current) => !current)}
          >
            {showAddPanel ? "Close add panel" : "Add to this room"}
          </Button>
        )}

        {showAddPanel && (
          <Card padding="md" className="gap-4">
            <AppText variant="title">Add something you already saved</AppText>
            <View className="flex-row flex-wrap gap-2">
              <AddModeButton
                label="Saved products"
                selected={addMode === "saved_product"}
                onPress={() => setAddMode("saved_product")}
              />
              <AddModeButton
                label="Selected deals"
                selected={addMode === "selected_deal"}
                onPress={() => setAddMode("selected_deal")}
              />
              <AddModeButton
                label="Tracked products"
                selected={addMode === "tracked_product"}
                onPress={() => setAddMode("tracked_product")}
              />
            </View>
            {addMode === "tracked_product" &&
              watchlistsQuery.data &&
              watchlistsQuery.data.length > 0 && (
                <View className="gap-2 border-t border-border pt-3">
                  <AppText variant="label">Your tracked products</AppText>
                  {watchlistsQuery.data.map((watchlist) => (
                    <SelectableRow
                      key={watchlist.id}
                      title={watchlist.name}
                      subtitle={`Tracking “${watchlist.search_query}”`}
                      onPress={() => selectWatchlist(watchlist)}
                    />
                  ))}
                </View>
              )}
            {addMode !== "tracked_product" && selectableListings.length > 0 ? (
              <View className="gap-2 border-t border-border pt-3">
                <AppText variant="label">
                  {addMode === "selected_deal" ? "Saved deals" : "Saved products"}
                </AppText>
                {selectableListings.map((listing) => (
                  <SelectableRow
                    key={listing.id}
                    title={listing.title}
                    subtitle={
                      listing.price !== null
                        ? `${listing.currency ?? ""} ${listing.price}`
                        : "Price unavailable"
                    }
                    onPress={() => selectListing(listing)}
                  />
                ))}
              </View>
            ) : addMode !== "tracked_product" ? (
              <AppText variant="bodySmall">Save a listing first, then it will appear here.</AppText>
            ) : watchlistsQuery.data?.length === 0 ? (
              <AppText variant="bodySmall">
                Create a watchlist first, then it will appear here as a tracked product.
              </AppText>
            ) : null}
          </Card>
        )}

        {operationError && <AppText variant="error">{operationError}</AppText>}

        <DealRoomCollaboratorsCard room={room} />
        <DealRoomActivityCard roomId={room.id} enabled={room.isMember} />

        {items.length === 0 ? (
          <EmptyState
            title="This room is ready for ideas"
            description="Add saved products, selected deals, or tracked products to start building your collection."
          />
        ) : (
          <View className="gap-3">
            {items.map((item, index) => (
              <View key={item.id} className="gap-2">
                <DealRoomItemCard
                  item={item}
                  disabled={isMutating}
                  canMoveUp={canContribute && index > 0}
                  canMoveDown={canContribute && index < items.length - 1}
                  canVote={room.isMember && room.role !== "viewer"}
                  canShortlist={canContribute}
                  onOpen={() => item.listingId && router.push(listingRoute(item.listingId))}
                  onMoveUp={() => moveItem(index, -1)}
                  onMoveDown={() => moveItem(index, 1)}
                  onRemove={() => confirmRemove(item)}
                  canRemove={canContribute}
                  onVote={() => voteMutation.mutate({ itemId: item.id, prefer: !item.viewerVoted })}
                  onToggleShortlist={() =>
                    shortlistMutation.mutate({
                      itemId: item.id,
                      isShortlisted: !item.isShortlisted,
                    })
                  }
                  onComments={() =>
                    setExpandedCommentsItemId((current) => (current === item.id ? null : item.id))
                  }
                />
                {expandedCommentsItemId === item.id && (
                  <DealRoomComments
                    roomId={room.id}
                    itemId={item.id}
                    userId={user.id}
                    canComment={canComment}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {room.role === "owner" && (
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-2xl py-3"
            disabled={isMutating}
            onPress={confirmDeleteRoom}
          >
            <AppIcon name="delete" size={16} color={theme.colors.textSecondary} />
            <AppText variant="bodySmall" className="text-text-secondary">
              Delete this Deal Room
            </AppText>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function AddModeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full px-3 py-2 ${selected ? "bg-primary" : "bg-background-muted"}`}
      onPress={onPress}
    >
      <AppText variant="caption" className={selected ? "font-semibold text-white" : ""}>
        {label}
      </AppText>
    </Pressable>
  );
}

function SelectableRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Add ${title}`}
      accessibilityRole="button"
      className="rounded-2xl bg-background-muted px-3 py-3"
      onPress={onPress}
    >
      <AppText variant="bodySmall" numberOfLines={2}>
        {title}
      </AppText>
      <AppText variant="caption" className="mt-1 text-text-secondary" numberOfLines={1}>
        {subtitle}
      </AppText>
    </Pressable>
  );
}
