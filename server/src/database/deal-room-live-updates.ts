import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateDealRoomLiveUpdate,
  type DealRoomLiveAlternative,
  type DealRoomLiveSnapshot,
  type DealRoomLiveState,
  type DealRoomLiveUpdateType,
} from "../deal-rooms/live-updates";
import { isMarketplaceListingQualitySignals } from "../marketplaces/shared/quality";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import type { WorkerLogger } from "../types/backend";
import type { RawApiListing } from "../api/types";

const ROOM_LISTING_COLUMNS =
  "id,marketplace_id,external_id,title,price,currency,url,image_url,condition,is_active,last_seen_at,raw_data,product_identity_id,product_variant_id";
const LIVE_STATE_COLUMNS =
  "room_item_id,listing_id,product_identity_id,title,image_url,current_price,currency,availability,source_marketplace_id,url,better_alternative_listing_id,better_alternative_source,better_alternative_price,better_alternative_currency,better_alternative_url,previous_price,price_change,price_change_percent,price_changed_at,availability_changed_at,last_update_type,last_changed_at,last_notified_at,last_notified_type,observed_at";

interface DealRoomItemRow {
  id: string;
  room_id: string;
  item_type: string;
  product_identity_id: string | null;
  listing_id: string | null;
  watchlist_id: string | null;
}

interface DealRoomRow {
  id: string;
  user_id: string;
  name: string;
}

interface DealRoomMemberRow {
  room_id: string;
  user_id: string;
}

interface MatchRow {
  watchlist_id: string;
  listing_id: string;
  matched_at: string;
}

interface LiveStateRow {
  room_item_id: string;
  listing_id: string | null;
  product_identity_id: string | null;
  title: string;
  image_url: string | null;
  current_price: number | string | null;
  currency: string | null;
  availability: "available" | "unavailable" | "unknown";
  source_marketplace_id: MarketplaceSource | null;
  url: string | null;
  better_alternative_listing_id: string | null;
  better_alternative_source: MarketplaceSource | null;
  better_alternative_price: number | string | null;
  better_alternative_currency: string | null;
  better_alternative_url: string | null;
  previous_price: number | string | null;
  price_change: number | string | null;
  price_change_percent: number | string | null;
  price_changed_at: string | null;
  availability_changed_at: string | null;
  last_update_type: string;
  last_changed_at: string | null;
  last_notified_at: string | null;
  last_notified_type: string | null;
  observed_at: string;
}

interface NotificationPreferenceRow {
  user_id: string;
  push_enabled: boolean;
  deal_room_updates_enabled?: boolean;
}

interface PushTokenRow {
  id: string;
  user_id: string;
}

export interface DealRoomLiveUpdateSummary {
  rooms: number;
  items: number;
  changed: number;
  notifications: number;
}

export async function refreshDealRoomLiveUpdates(
  client: SupabaseClient,
  observedAt: string,
  logger: WorkerLogger,
): Promise<DealRoomLiveUpdateSummary> {
  const [{ data: itemRows, error: itemError }, { data: roomRows, error: roomError }] =
    await Promise.all([
      client
        .from("deal_room_items")
        .select("id,room_id,item_type,product_identity_id,listing_id,watchlist_id")
        .returns<DealRoomItemRow[]>(),
      client.from("deal_rooms").select("id,user_id,name").returns<DealRoomRow[]>(),
    ]);
  if (itemError) throw itemError;
  if (roomError) throw roomError;

  const items = itemRows ?? [];
  const rooms = roomRows ?? [];
  if (items.length === 0) {
    return { rooms: rooms.length, items: 0, changed: 0, notifications: 0 };
  }

  const itemIds = items.map((item) => item.id);
  const previousStates = await getPreviousStates(client, itemIds);
  const previousByItemId = new Map(previousStates.map((state) => [state.room_item_id, state]));
  const listingIds = [
    ...new Set([
      ...items.flatMap((item) => (item.listing_id ? [item.listing_id] : [])),
      ...previousStates.flatMap((state) => (state.listing_id ? [state.listing_id] : [])),
    ]),
  ];
  const productIdentityIds = [
    ...new Set(
      items.flatMap((item) => (item.product_identity_id ? [item.product_identity_id] : [])),
    ),
  ];
  const watchlistIds = [
    ...new Set(items.flatMap((item) => (item.watchlist_id ? [item.watchlist_id] : []))),
  ];

  const [directListings, identityListings, matchRows] = await Promise.all([
    getListingsByIds(client, listingIds),
    getListingsByProductIdentity(client, productIdentityIds),
    getLatestMatches(client, watchlistIds),
  ]);
  const matchListingIds = [...new Set(matchRows.map((match) => match.listing_id))];
  const matchedListings = await getListingsByIds(client, matchListingIds);
  const allListings = [...directListings, ...identityListings, ...matchedListings];
  const listingById = new Map(allListings.map((listing) => [listing.id, listing]));
  const listingsByIdentity = groupListingsByIdentity(allListings);
  const latestMatchByWatchlist = getLatestMatchListings(matchRows, listingById);
  const identityTitles = await getProductIdentityTitles(client, productIdentityIds);

  const stateRows: Array<Record<string, unknown>> = [];
  const historyRows: Array<Record<string, unknown>> = [];
  const changedItems: Array<{
    item: DealRoomItemRow;
    room: DealRoomRow;
    updateType: DealRoomLiveUpdateType;
    state: DealRoomLiveState;
  }> = [];

  for (const item of items) {
    const room = rooms.find((candidate) => candidate.id === item.room_id);
    if (!room) continue;

    const previousRow = previousByItemId.get(item.id);
    const previous = previousRow ? toLiveState(previousRow) : null;
    const currentListing = selectCurrentListing(
      item,
      previous,
      listingById,
      listingsByIdentity,
      latestMatchByWatchlist,
    );
    const snapshot = toSnapshot(item, currentListing, identityTitles, listingsByIdentity);
    const evaluation = evaluateDealRoomLiveUpdate(previous, snapshot, observedAt);
    stateRows.push(toStateRow(item.id, evaluation.state, observedAt));

    if (evaluation.changeType) {
      historyRows.push(
        toHistoryRow(item.id, evaluation.state, evaluation.changeType, previous, observedAt),
      );
      if (evaluation.changeType !== "initial") {
        changedItems.push({
          item,
          room,
          updateType: evaluation.changeType,
          state: evaluation.state,
        });
      }
    }
  }

  if (stateRows.length > 0) {
    const { error } = await client
      .from("deal_room_item_live_states")
      .upsert(stateRows, { onConflict: "room_item_id" });
    if (error) throw error;
  }
  if (historyRows.length > 0) {
    const { error } = await client.from("deal_room_item_history").insert(historyRows);
    if (error) throw error;
  }

  const changedRoomIds = [...new Set(changedItems.map(({ item }) => item.room_id))];
  if (changedRoomIds.length > 0) {
    const { error } = await client
      .from("deal_rooms")
      .update({ updated_at: observedAt })
      .in("id", changedRoomIds);
    if (error) throw error;
  }

  const notifications = await createDealRoomNotifications(client, changedItems, rooms, observedAt);
  logger.info("Deal Room live updates refreshed", {
    changed: changedItems.length,
    items: items.length,
    notifications,
    rooms: rooms.length,
  });

  return {
    rooms: rooms.length,
    items: items.length,
    changed: changedItems.length,
    notifications,
  };
}

async function getPreviousStates(client: SupabaseClient, itemIds: string[]) {
  const { data, error } = await client
    .from("deal_room_item_live_states")
    .select(LIVE_STATE_COLUMNS)
    .in("room_item_id", itemIds)
    .returns<LiveStateRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getListingsByIds(client: SupabaseClient, listingIds: string[]) {
  if (listingIds.length === 0) return [];
  const { data, error } = await client
    .from("listings")
    .select(ROOM_LISTING_COLUMNS)
    .in("id", listingIds)
    .returns<RawApiListing[]>();
  if (error) throw error;
  return data ?? [];
}

async function getListingsByProductIdentity(client: SupabaseClient, productIdentityIds: string[]) {
  if (productIdentityIds.length === 0) return [];
  const { data, error } = await client
    .from("listings")
    .select(ROOM_LISTING_COLUMNS)
    .in("product_identity_id", productIdentityIds)
    .returns<RawApiListing[]>();
  if (error) throw error;
  return data ?? [];
}

async function getLatestMatches(client: SupabaseClient, watchlistIds: string[]) {
  if (watchlistIds.length === 0) return [];
  const { data, error } = await client
    .from("matches")
    .select("watchlist_id,listing_id,matched_at")
    .in("watchlist_id", watchlistIds)
    .neq("status", "dismissed")
    .order("matched_at", { ascending: false })
    .returns<MatchRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getProductIdentityTitles(client: SupabaseClient, identityIds: string[]) {
  if (identityIds.length === 0) return new Map<string, string>();
  const { data, error } = await client
    .from("product_identities")
    .select("id,canonical_title")
    .in("id", identityIds)
    .returns<Array<{ id: string; canonical_title: string }>>();
  if (error) throw error;
  return new Map((data ?? []).map((identity) => [identity.id, identity.canonical_title]));
}

function groupListingsByIdentity(listings: RawApiListing[]) {
  const grouped = new Map<string, RawApiListing[]>();
  for (const listing of listings) {
    if (!listing.product_identity_id) continue;
    const group = grouped.get(listing.product_identity_id) ?? [];
    group.push(listing);
    grouped.set(listing.product_identity_id, group);
  }
  return grouped;
}

function getLatestMatchListings(matches: MatchRow[], listingById: Map<string, RawApiListing>) {
  const latest = new Map<string, RawApiListing>();
  for (const match of matches) {
    if (!latest.has(match.watchlist_id)) {
      const listing = listingById.get(match.listing_id);
      if (listing) latest.set(match.watchlist_id, listing);
    }
  }
  return latest;
}

function selectCurrentListing(
  item: DealRoomItemRow,
  previous: DealRoomLiveState | null,
  listingById: Map<string, RawApiListing>,
  listingsByIdentity: Map<string, RawApiListing[]>,
  latestMatchByWatchlist: Map<string, RawApiListing>,
) {
  if (item.listing_id) return listingById.get(item.listing_id) ?? null;
  if (item.watchlist_id) {
    if (previous?.listingId) {
      const previousListing = listingById.get(previous.listingId);
      if (previousListing) return previousListing;
    }
    return latestMatchByWatchlist.get(item.watchlist_id) ?? null;
  }
  if (item.product_identity_id) {
    const identityListings = listingsByIdentity.get(item.product_identity_id) ?? [];
    if (previous?.listingId) {
      const previousListing = identityListings.find((listing) => listing.id === previous.listingId);
      if (previousListing) return previousListing;
    }

    return [...identityListings].sort(compareCurrentListings)[0] ?? null;
  }
  return null;
}

function compareCurrentListings(left: RawApiListing, right: RawApiListing) {
  if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
  if (left.price !== null && right.price !== null && left.price !== right.price) {
    return Number(left.price) - Number(right.price);
  }
  return Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at);
}

function toSnapshot(
  item: DealRoomItemRow,
  listing: RawApiListing | null,
  identityTitles: ReadonlyMap<string, string>,
  listingsByIdentity: ReadonlyMap<string, RawApiListing[]>,
): DealRoomLiveSnapshot {
  return {
    listingId: listing?.id ?? item.listing_id,
    productIdentityId: item.product_identity_id ?? listing?.product_identity_id ?? null,
    title:
      listing?.title ?? identityTitles.get(item.product_identity_id ?? "") ?? "Saved DealDrop item",
    imageUrl: listing?.image_url ?? null,
    currentPrice: numericOrNull(listing?.price ?? null),
    currency: listing?.currency ?? null,
    availability: listing ? getListingAvailability(listing) : "unknown",
    source: listing ? toMarketplaceSource(listing.marketplace_id) : null,
    url: listing?.url ?? null,
    betterAlternative: findBetterAlternative(
      listing,
      item.product_identity_id ?? listing?.product_identity_id ?? null,
      listingsByIdentity,
    ),
  };
}

function findBetterAlternative(
  currentListing: RawApiListing | null,
  productIdentityId: string | null,
  listingsByIdentity: ReadonlyMap<string, RawApiListing[]>,
): DealRoomLiveAlternative | null {
  if (!currentListing || !productIdentityId) return null;

  const candidates = (listingsByIdentity.get(productIdentityId) ?? []).filter(
    (listing) =>
      listing.id !== currentListing.id &&
      listing.is_active &&
      listing.marketplace_id !== currentListing.marketplace_id &&
      getListingAvailability(listing) === "available" &&
      isComparableListing(currentListing, listing) &&
      numericOrNull(listing.price) !== null,
  );
  const alternative = [...candidates].sort((left, right) => {
    const leftPrice = numericOrNull(left.price) ?? Number.POSITIVE_INFINITY;
    const rightPrice = numericOrNull(right.price) ?? Number.POSITIVE_INFINITY;
    return leftPrice - rightPrice;
  })[0];
  const currentPrice = numericOrNull(currentListing.price);
  const alternativePrice = numericOrNull(alternative?.price);
  if (!alternative || currentPrice === null || alternativePrice === null) return null;
  if (normalizeCurrency(currentListing.currency) !== normalizeCurrency(alternative.currency)) {
    return null;
  }
  if (alternativePrice >= currentPrice) return null;

  const source = toMarketplaceSource(alternative.marketplace_id);
  if (!source) return null;

  return {
    listingId: alternative.id,
    source,
    price: alternativePrice,
    currency: alternative.currency,
    url: alternative.url,
  };
}

function isComparableListing(left: RawApiListing, right: RawApiListing) {
  if (left.product_variant_id && right.product_variant_id) {
    return left.product_variant_id === right.product_variant_id;
  }
  return normalizeCondition(left.condition) === normalizeCondition(right.condition);
}

function normalizeCondition(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizeCurrency(value: string | null) {
  return value?.trim().toUpperCase() || null;
}

function toLiveState(row: LiveStateRow): DealRoomLiveState {
  return {
    listingId: row.listing_id,
    productIdentityId: row.product_identity_id,
    title: row.title,
    imageUrl: row.image_url,
    currentPrice: numericOrNull(row.current_price),
    currency: row.currency,
    availability: row.availability,
    source: row.source_marketplace_id,
    url: row.url,
    betterAlternative:
      row.better_alternative_listing_id && row.better_alternative_source
        ? {
            listingId: row.better_alternative_listing_id,
            source: row.better_alternative_source,
            price: numericOrNull(row.better_alternative_price),
            currency: row.better_alternative_currency,
            url: row.better_alternative_url,
          }
        : null,
    previousPrice: numericOrNull(row.previous_price),
    priceChange: numericOrNull(row.price_change),
    priceChangePercent: numericOrNull(row.price_change_percent),
    priceChangedAt: row.price_changed_at,
    availabilityChangedAt: row.availability_changed_at,
    lastUpdateType: normalizeUpdateType(row.last_update_type),
    lastChangedAt: row.last_changed_at,
    lastNotifiedAt: row.last_notified_at,
    lastNotifiedType: row.last_notified_type ? normalizeUpdateType(row.last_notified_type) : null,
  };
}

function toStateRow(itemId: string, state: DealRoomLiveState, observedAt: string) {
  return {
    room_item_id: itemId,
    listing_id: state.listingId,
    product_identity_id: state.productIdentityId,
    title: state.title,
    image_url: state.imageUrl,
    current_price: state.currentPrice,
    currency: state.currency,
    availability: state.availability,
    source_marketplace_id: state.source,
    url: state.url,
    better_alternative_listing_id: state.betterAlternative?.listingId ?? null,
    better_alternative_source: state.betterAlternative?.source ?? null,
    better_alternative_price: state.betterAlternative?.price ?? null,
    better_alternative_currency: state.betterAlternative?.currency ?? null,
    better_alternative_url: state.betterAlternative?.url ?? null,
    previous_price: state.previousPrice,
    price_change: state.priceChange,
    price_change_percent: state.priceChangePercent,
    price_changed_at: state.priceChangedAt,
    availability_changed_at: state.availabilityChangedAt,
    last_update_type: state.lastUpdateType,
    last_changed_at: state.lastChangedAt,
    last_notified_at: state.lastNotifiedAt,
    last_notified_type: state.lastNotifiedType,
    observed_at: observedAt,
  };
}

function toHistoryRow(
  itemId: string,
  state: DealRoomLiveState,
  updateType: DealRoomLiveUpdateType,
  previous: DealRoomLiveState | null,
  observedAt: string,
) {
  return {
    room_item_id: itemId,
    listing_id: state.listingId,
    product_identity_id: state.productIdentityId,
    title: state.title,
    image_url: state.imageUrl,
    current_price: state.currentPrice,
    currency: state.currency,
    availability: state.availability,
    source_marketplace_id: state.source,
    url: state.url,
    better_alternative_listing_id: state.betterAlternative?.listingId ?? null,
    better_alternative_source: state.betterAlternative?.source ?? null,
    better_alternative_price: state.betterAlternative?.price ?? null,
    better_alternative_currency: state.betterAlternative?.currency ?? null,
    better_alternative_url: state.betterAlternative?.url ?? null,
    previous_price: previous?.currentPrice ?? null,
    previous_availability: previous?.availability ?? null,
    change_type: updateType,
    observed_at: observedAt,
  };
}

async function createDealRoomNotifications(
  client: SupabaseClient,
  changedItems: Array<{
    item: DealRoomItemRow;
    room: DealRoomRow;
    updateType: DealRoomLiveUpdateType;
    state: DealRoomLiveState;
  }>,
  rooms: DealRoomRow[],
  observedAt: string,
) {
  if (changedItems.length === 0) return 0;
  const roomIds = [...new Set(changedItems.map(({ item }) => item.room_id))];
  const { data: members, error: memberError } = await client
    .from("deal_room_members")
    .select("room_id,user_id")
    .in("room_id", roomIds)
    .returns<DealRoomMemberRow[]>();
  if (memberError) throw memberError;

  const recipientIdsByRoom = new Map<string, Set<string>>();
  for (const roomId of roomIds) recipientIdsByRoom.set(roomId, new Set());
  for (const room of rooms) recipientIdsByRoom.get(room.id)?.add(room.user_id);
  for (const member of members ?? []) recipientIdsByRoom.get(member.room_id)?.add(member.user_id);
  const recipientIds = [...new Set([...recipientIdsByRoom.values()].flatMap((ids) => [...ids]))];
  if (recipientIds.length === 0) return 0;

  const [{ data: preferences, error: preferenceError }, { data: tokens, error: tokenError }] =
    await Promise.all([
      client
        .from("notification_preferences")
        .select("user_id,push_enabled,deal_room_updates_enabled")
        .in("user_id", recipientIds)
        .returns<NotificationPreferenceRow[]>(),
      client
        .from("push_tokens")
        .select("id,user_id")
        .in("user_id", recipientIds)
        .eq("is_active", true)
        .returns<PushTokenRow[]>(),
    ]);
  if (preferenceError) throw preferenceError;
  if (tokenError) throw tokenError;

  const preferenceByUser = new Map(
    (preferences ?? []).map((preference) => [preference.user_id, preference]),
  );
  const tokensByUser = new Map<string, PushTokenRow[]>();
  for (const token of tokens ?? []) {
    const userTokens = tokensByUser.get(token.user_id) ?? [];
    userTokens.push(token);
    tokensByUser.set(token.user_id, userTokens);
  }

  let notificationCount = 0;
  for (const changed of changedItems) {
    const title = `${changed.room.name} updated`;
    const body = buildNotificationBody(changed.updateType, changed.state);
    const recipients = [...(recipientIdsByRoom.get(changed.item.room_id) ?? [])].filter(
      (userId) => preferenceByUser.get(userId)?.deal_room_updates_enabled !== false,
    );
    for (const userId of recipients) {
      const notificationId = randomUUID();
      const { error: notificationError } = await client.from("notifications").insert({
        id: notificationId,
        user_id: userId,
        type: "deal_room_update",
        title,
        body,
        data: {
          url: `/deal-room/${changed.item.room_id}`,
          notification_id: notificationId,
          deal_room_id: changed.item.room_id,
          deal_room_item_id: changed.item.id,
          update_type: changed.updateType,
          observed_at: observedAt,
          price: changed.state.currentPrice,
          currency: changed.state.currency,
          availability: changed.state.availability,
          better_alternative_source: changed.state.betterAlternative?.source ?? null,
        },
      });
      if (notificationError) throw notificationError;

      const preference = preferenceByUser.get(userId);
      const queueRows = (tokensByUser.get(userId) ?? []).map((token) => ({
        notification_id: notificationId,
        user_id: userId,
        push_token_id: token.id,
      }));
      if (queueRows.length > 0 && preference?.push_enabled !== false) {
        const { error: queueError } = await client.from("notification_queue").upsert(queueRows, {
          onConflict: "notification_id,push_token_id",
          ignoreDuplicates: true,
        });
        if (queueError) throw queueError;
      }
      notificationCount += 1;
    }
  }

  return notificationCount;
}

function buildNotificationBody(updateType: DealRoomLiveUpdateType, state: DealRoomLiveState) {
  if (updateType === "listing_unavailable") {
    return `${state.title} is no longer available where it was last observed.`;
  }
  if (updateType === "availability_changed") {
    return `${state.title} availability changed to ${formatAvailability(state.availability)}.`;
  }
  if (updateType === "better_alternative") {
    return state.betterAlternative
      ? `A lower-priced alternative is now available on ${formatSource(state.betterAlternative.source)}.`
      : `${state.title} has a new marketplace alternative.`;
  }
  return `${state.title} is now ${formatPrice(state.currentPrice, state.currency)}.`;
}

function getListingAvailability(listing: RawApiListing) {
  if (!listing.is_active) return "unavailable" as const;
  const qualitySignals = getQualitySignals(listing.raw_data);
  const status = qualitySignals?.availability.status.value;
  const rawStatus = qualitySignals?.availability.rawStatus.value;
  const quantity = qualitySignals?.availability.quantity.value;
  if (status === "unavailable" || quantity === 0 || isUnavailableText(rawStatus)) {
    return "unavailable" as const;
  }
  return "available" as const;
}

function getQualitySignals(rawData: Record<string, unknown> | null | undefined) {
  return isMarketplaceListingQualitySignals(rawData?.qualitySignals)
    ? rawData.qualitySignals
    : null;
}

function isUnavailableText(value: string | null | undefined) {
  return Boolean(value && /unavailable|out of stock|sold out|ended|discontinued/i.test(value));
}

function numericOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUpdateType(value: string): DealRoomLiveUpdateType {
  if (
    value === "price_changed" ||
    value === "availability_changed" ||
    value === "listing_unavailable" ||
    value === "better_alternative"
  ) {
    return value;
  }
  return "initial";
}

function toMarketplaceSource(value: string): MarketplaceSource | null {
  if ((Object.values(MARKETPLACE_IDS) as string[]).includes(value)) {
    return value as MarketplaceSource;
  }
  return null;
}

function formatAvailability(value: DealRoomLiveSnapshot["availability"]) {
  if (value === "available") return "available";
  if (value === "unavailable") return "unavailable";
  return "unknown";
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return "an unknown price";
  return `${currency ? `${currency} ` : ""}${price.toFixed(2)}`;
}

function formatSource(source: MarketplaceSource) {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
