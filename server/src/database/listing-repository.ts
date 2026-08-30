import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesWatchlist } from "../matching/watchlist";
import {
  getNotificationQueueHealth,
  processNotificationQueue,
  type NotificationQueueHealth,
  type NotificationDeliverySummary,
} from "../notifications/delivery";
import { deduplicateIngestionListings } from "./listing-ingestion";
import type { MarketplaceListing } from "../marketplaces/shared/adapter";
import { isMarketplaceProductMetadata } from "../listings/relevance";
import {
  createUnknownListingQualitySignals,
  isMarketplaceListingQualitySignals,
} from "../marketplaces/shared/quality";
import { MARKETPLACE_IDS, type MarketplaceSource } from "../marketplaces/shared/types";
import type { MarketplaceComparisonOffer } from "../marketplaces/comparison";
import { resolveProductIdentityAssignments } from "../product-identity/repository";
import type {
  SourcingMonitoringTarget,
  SourcingOpportunityAlert,
  SourcingProductAlertState,
  SourcingProductAlertStateUpdate,
} from "../sourcing/alerts";
import type {
  MarketplaceWatchlist,
  WatchlistFilters,
  WatchlistLifecycleState,
  WatchlistMarketplaceScope,
} from "../types/backend";
import {
  validateWatchlistMarketplaceSelection,
  type ValidatedWatchlistMarketplaceSelection,
} from "../watchlists/validation";
import type { WatchlistMarketplaceSelectionInput } from "../watchlists/types";

interface StoredWatchlist {
  id: string;
  user_id: string;
  search_query: string;
  filters: WatchlistFilters;
  alert_mode: "instant" | "digest";
  marketplace_id: string;
  marketplace_scope: WatchlistMarketplaceScope;
  lifecycle_state?: WatchlistLifecycleState;
  snoozed_until?: string | null;
  completed_at?: string | null;
  watchlist_marketplaces?: Array<{ marketplace_id: string }>;
}

interface StoredSourcingTargetRow {
  id: string;
  sourcing_list_id: string;
  category: string;
  product_name: string;
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
  keywords: string[];
  target_quantity: number;
  target_unit_cost: number | string | null;
  target_unit_cost_currency: string | null;
  max_unit_cost: number | string | null;
  max_unit_cost_currency: string | null;
  estimated_shipping_cost: number | string | null;
  estimated_shipping_currency: string | null;
  estimated_duties_taxes: number | string | null;
  estimated_duties_taxes_currency: string | null;
  other_sourcing_cost: number | string | null;
  other_sourcing_cost_currency: string | null;
  max_landed_unit_cost: number | string | null;
  max_landed_unit_cost_currency: string | null;
  alert_cost_basis: "marketplace_price" | "landed_unit_cost";
  preferred_condition: string | null;
  alert_enabled: boolean;
  alert_target_price_reached: boolean;
  alert_new_cheaper_source: boolean;
  alert_price_dropped: boolean;
  alert_quantity_available: boolean;
  alert_back_in_stock: boolean;
  alert_cooldown_minutes: number;
  sourcing_lists:
    | {
        id: string;
        workspace_id: string;
        name: string;
        status: "active" | "paused" | "completed";
      }
    | Array<{
        id: string;
        workspace_id: string;
        name: string;
        status: "active" | "paused" | "completed";
      }>;
  sourcing_list_product_marketplaces?: Array<{ marketplace_id: MarketplaceSource }>;
}

const SOURCING_TARGET_COLUMNS =
  "id,sourcing_list_id,category,product_name,upc,gtin,mpn,keywords,target_quantity,target_unit_cost,target_unit_cost_currency,max_unit_cost,max_unit_cost_currency,estimated_shipping_cost,estimated_shipping_currency,estimated_duties_taxes,estimated_duties_taxes_currency,other_sourcing_cost,other_sourcing_cost_currency,max_landed_unit_cost,max_landed_unit_cost_currency,alert_cost_basis,preferred_condition,alert_enabled,alert_target_price_reached,alert_new_cheaper_source,alert_price_dropped,alert_quantity_available,alert_back_in_stock,alert_cooldown_minutes,sourcing_lists!inner(id,workspace_id,name,status),sourcing_list_product_marketplaces(marketplace_id)";

const SOURCING_ALERT_STATE_COLUMNS =
  "workspace_id,sourcing_list_product_id,marketplace_id,external_id,price,currency,landed_unit_cost,landed_unit_cost_currency,available_quantity,availability,observed_at,target_reached,last_notified_at,last_notified_type";

export interface StoredListing {
  id: string;
  marketplace_id: string;
  external_id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  image_url: string | null;
  seller_name: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  posted_at: string | null;
  fetched_at: string;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown>;
  product_identity_id?: string | null;
  product_variant_id?: string | null;
  identity_match_status?: "matched" | "ambiguous" | "unmatched" | "manual";
  identity_match_method?: "identifier" | "brand_model" | "title_variant" | "manual" | "none";
  identity_match_confidence?: number | string | null;
  product_identity_data?: Record<string, unknown>;
}

export type StoredListingReference = Pick<
  StoredListing,
  | "id"
  | "marketplace_id"
  | "external_id"
  | "product_identity_id"
  | "product_variant_id"
  | "identity_match_status"
  | "identity_match_method"
  | "identity_match_confidence"
  | "product_identity_data"
>;

export interface ProductPriceObservationRow {
  product_identity_id: string;
  product_variant_id: string;
  listing_id: string;
  marketplace_id: MarketplaceSource;
  external_id: string;
  condition: string | null;
  price: number;
  shipping_price: null;
  shipping_currency: null;
  currency: string;
  observed_at: string;
}

export function buildProductPriceObservationRows(
  listings: readonly MarketplaceListing[],
  storedListings: readonly StoredListingReference[],
  observedAt: string,
): ProductPriceObservationRow[] {
  const storedByIdentity = new Map(
    storedListings.map((listing) => [
      listingIdentity(listing.marketplace_id, listing.external_id),
      listing,
    ]),
  );

  return listings.flatMap((listing) => {
    const stored = storedByIdentity.get(listingIdentity(listing.source, listing.externalId));
    const currency = normalizeCurrency(listing.currency);
    if (
      !stored?.id ||
      !stored.product_identity_id ||
      !stored.product_variant_id ||
      listing.price === null ||
      !currency
    ) {
      return [];
    }

    return [
      {
        product_identity_id: stored.product_identity_id,
        product_variant_id: stored.product_variant_id,
        listing_id: stored.id,
        marketplace_id: listing.source,
        external_id: listing.externalId,
        condition: listing.condition,
        price: listing.price,
        shipping_price: null,
        shipping_currency: null,
        currency,
        observed_at: observedAt,
      },
    ];
  });
}

export interface ActiveStoredListing {
  stored: StoredListing;
  listing: MarketplaceListing;
}

export class ListingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveWatchlistsForSources(availableSources: readonly MarketplaceSource[]) {
    const watchlists = await this.loadActiveWatchlists();
    return watchlists
      .map((watchlist) => toMarketplaceWatchlist(watchlist, availableSources))
      .filter((watchlist) => watchlist.marketplaceIds.length > 0);
  }

  async getActiveSourcingTargets(
    availableSources: readonly MarketplaceSource[],
  ): Promise<SourcingMonitoringTarget[]> {
    const { data, error } = await this.client
      .from("sourcing_list_products")
      .select(SOURCING_TARGET_COLUMNS)
      .eq("sourcing_lists.status", "active")
      .returns<StoredSourcingTargetRow[]>();
    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const workspaceIds = [
      ...new Set(
        rows
          .map((row) => unwrap(row.sourcing_lists)?.workspace_id)
          .filter((workspaceId): workspaceId is string => Boolean(workspaceId)),
      ),
    ];
    if (workspaceIds.length === 0) {
      return [];
    }

    const { data: members, error: memberError } = await this.client
      .from("workspace_members")
      .select("workspace_id,user_id")
      .in("workspace_id", workspaceIds)
      .returns<Array<{ workspace_id: string; user_id: string }>>();
    if (memberError) {
      throw memberError;
    }

    const memberIds = new Map<string, string[]>();
    for (const member of members ?? []) {
      const existing = memberIds.get(member.workspace_id) ?? [];
      existing.push(member.user_id);
      memberIds.set(member.workspace_id, existing);
    }

    const available = new Set(availableSources);
    return rows.flatMap((row) => {
      const list = unwrap(row.sourcing_lists);
      if (!list || list.status !== "active") return [];

      const marketplaceIds = (row.sourcing_list_product_marketplaces ?? [])
        .map((item) => item.marketplace_id)
        .filter((source): source is MarketplaceSource => available.has(source));
      const recipients = memberIds.get(list.workspace_id) ?? [];
      if (marketplaceIds.length === 0 || recipients.length === 0) return [];

      return [
        {
          workspaceId: list.workspace_id,
          sourcingListId: list.id,
          sourcingListName: list.name,
          productId: row.id,
          productName: row.product_name,
          upc: row.upc,
          gtin: row.gtin,
          mpn: row.mpn,
          keywords: row.keywords ?? [],
          targetQuantity: row.target_quantity,
          targetUnitCost: toNumber(row.target_unit_cost),
          targetUnitCostCurrency: row.target_unit_cost_currency,
          maxUnitCost: toNumber(row.max_unit_cost),
          maxUnitCostCurrency: row.max_unit_cost_currency,
          estimatedShippingCost: toNumber(row.estimated_shipping_cost),
          estimatedShippingCurrency: row.estimated_shipping_currency,
          estimatedDutiesTaxes: toNumber(row.estimated_duties_taxes),
          estimatedDutiesTaxesCurrency: row.estimated_duties_taxes_currency,
          otherSourcingCost: toNumber(row.other_sourcing_cost),
          otherSourcingCostCurrency: row.other_sourcing_cost_currency,
          maxLandedUnitCost: toNumber(row.max_landed_unit_cost),
          maxLandedUnitCostCurrency: row.max_landed_unit_cost_currency,
          alertCostBasis: row.alert_cost_basis,
          preferredCondition: row.preferred_condition,
          marketplaceIds: [...new Set(marketplaceIds)],
          alertEnabled: row.alert_enabled,
          alertTargetPriceReached: row.alert_target_price_reached,
          alertNewCheaperSource: row.alert_new_cheaper_source,
          alertPriceDropped: row.alert_price_dropped,
          alertQuantityAvailable: row.alert_quantity_available,
          alertBackInStock: row.alert_back_in_stock,
          alertCooldownMinutes: row.alert_cooldown_minutes,
          memberUserIds: [...new Set(recipients)],
        },
      ];
    });
  }

  async getSourcingProductAlertStates(
    workspaceId: string,
    productId: string,
  ): Promise<SourcingProductAlertState[]> {
    const { data, error } = await this.client
      .from("sourcing_product_alert_states")
      .select(SOURCING_ALERT_STATE_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("sourcing_list_product_id", productId)
      .returns<
        Array<{
          marketplace_id: MarketplaceSource;
          external_id: string;
          price: number | string | null;
          currency: string | null;
          landed_unit_cost: number | string | null;
          landed_unit_cost_currency: string | null;
          available_quantity: number | null;
          availability: string | null;
          observed_at: string;
          target_reached: boolean | null;
          last_notified_at: string | null;
          last_notified_type: SourcingProductAlertState["lastNotifiedType"];
        }>
      >();
    if (error) {
      throw error;
    }

    return (data ?? []).map((state) => ({
      source: state.marketplace_id,
      externalId: state.external_id,
      price: toNumber(state.price),
      currency: state.currency,
      landedUnitCost: toNumber(state.landed_unit_cost),
      landedUnitCostCurrency: state.landed_unit_cost_currency,
      availableQuantity: state.available_quantity,
      availability: state.availability,
      observedAt: state.observed_at,
      targetReached: state.target_reached,
      lastNotifiedAt: state.last_notified_at,
      lastNotifiedType: state.last_notified_type,
    }));
  }

  async persistSourcingProductMonitoring(
    target: SourcingMonitoringTarget,
    offers: readonly MarketplaceComparisonOffer[],
    stateUpdates: readonly SourcingProductAlertStateUpdate[],
    alerts: readonly SourcingOpportunityAlert[],
  ) {
    const observedAt = stateUpdates[0]?.observedAt ?? new Date().toISOString();
    const observationRows = offers.map((offer) => ({
      workspace_id: target.workspaceId,
      sourcing_list_product_id: target.productId,
      listing_id: offer.listingId,
      marketplace_id: offer.source,
      external_id: offer.externalId,
      title: offer.title,
      seller_name: offer.sellerName,
      url: offer.url,
      observed_at: observedAt,
      observed_price: offer.price,
      currency: offer.currency,
      available_quantity: offer.availableQuantity,
      shipping_cost: offer.shippingCost,
      shipping_currency: offer.shippingCurrency,
      landed_unit_cost: offer.landedUnitCost,
      landed_unit_cost_currency: offer.landedUnitCostCurrency,
      availability: offer.availability,
    }));

    if (observationRows.length > 0) {
      const { error } = await this.client
        .from("sourcing_product_price_observations")
        .upsert(observationRows, {
          onConflict:
            "workspace_id,sourcing_list_product_id,marketplace_id,external_id,observed_at",
        });
      if (error) throw error;
    }

    if (stateUpdates.length > 0) {
      const stateRows = stateUpdates.map((state) => ({
        workspace_id: target.workspaceId,
        sourcing_list_product_id: target.productId,
        marketplace_id: state.source,
        external_id: state.externalId,
        price: state.price,
        currency: state.currency,
        landed_unit_cost: state.landedUnitCost,
        landed_unit_cost_currency: state.landedUnitCostCurrency,
        available_quantity: state.availableQuantity,
        availability: state.availability,
        observed_at: state.observedAt,
        target_reached: state.targetReached,
        last_notified_at: state.lastNotifiedAt,
        last_notified_type: state.lastNotifiedType,
      }));
      const { error } = await this.client.from("sourcing_product_alert_states").upsert(stateRows, {
        onConflict: "workspace_id,sourcing_list_product_id,marketplace_id,external_id",
      });
      if (error) throw error;
    }

    if (alerts.length > 0 && target.memberUserIds.length > 0) {
      await this.enqueueSourcingAlerts(target, alerts);
    }
  }

  private async enqueueSourcingAlerts(
    target: SourcingMonitoringTarget,
    alerts: readonly SourcingOpportunityAlert[],
  ) {
    const notificationRows = alerts.flatMap((alert) =>
      target.memberUserIds.map((userId) => ({
        user_id: userId,
        match_id: null,
        type: alert.type,
        title: alert.title,
        body: alert.body,
        data: {
          url: `/sourcing-list/${target.sourcingListId}/product/${target.productId}/history`,
          alert_type: alert.type,
          workspace_id: target.workspaceId,
          sourcing_list_id: target.sourcingListId,
          sourcing_list_product_id: target.productId,
          listing_id: alert.offer.listingId,
          marketplace_source: alert.offer.source,
          external_listing_id: alert.offer.externalId,
          price: alert.offer.price,
          currency: alert.offer.currency,
          alert_mode: "instant",
        },
      })),
    );
    const { data: notifications, error: notificationError } = await this.client
      .from("notifications")
      .insert(notificationRows)
      .select("id,user_id")
      .returns<Array<{ id: string; user_id: string }>>();
    if (notificationError) throw notificationError;

    const { data: pushTokens, error: tokenError } = await this.client
      .from("push_tokens")
      .select("id,user_id")
      .in("user_id", target.memberUserIds)
      .eq("is_active", true)
      .returns<Array<{ id: string; user_id: string }>>();
    if (tokenError) throw tokenError;

    const { data: preferences, error: preferencesError } = await this.client
      .from("notification_preferences")
      .select("user_id,push_enabled")
      .in("user_id", target.memberUserIds)
      .returns<Array<{ user_id: string; push_enabled: boolean }>>();
    if (preferencesError) throw preferencesError;

    const pushEnabledByUser = new Map(
      (preferences ?? []).map((preference) => [preference.user_id, preference.push_enabled]),
    );
    const queueRows = (notifications ?? []).flatMap((notification) =>
      (pushTokens ?? [])
        .filter(
          (token) =>
            token.user_id === notification.user_id &&
            pushEnabledByUser.get(token.user_id) !== false,
        )
        .map((token) => ({
          notification_id: notification.id,
          user_id: notification.user_id,
          push_token_id: token.id,
        })),
    );
    if (queueRows.length === 0) return;

    const { error: queueError } = await this.client
      .from("notification_queue")
      .upsert(queueRows, { onConflict: "notification_id,push_token_id", ignoreDuplicates: true });
    if (queueError) throw queueError;
  }

  async setWatchlistMarketplaceSelection(
    watchlistId: string,
    selection: WatchlistMarketplaceSelectionInput,
    availableSources: readonly MarketplaceSource[],
  ): Promise<ValidatedWatchlistMarketplaceSelection> {
    const validated = validateWatchlistMarketplaceSelection(selection, availableSources);
    const { error } = await this.client.rpc("set_watchlist_marketplace_selection", {
      p_marketplace_ids: validated.marketplaceIds,
      p_scope: validated.scope,
      p_watchlist_id: watchlistId,
    });

    if (error) {
      throw error;
    }

    return validated;
  }

  async upsertListings(listings: MarketplaceListing[], observedAt = new Date().toISOString()) {
    if (listings.length === 0) {
      return [];
    }

    const uniqueListings = deduplicateIngestionListings(listings);
    const identityAssignments = await resolveProductIdentityAssignments(
      this.client,
      uniqueListings,
    );
    const rows = uniqueListings.map((listing) => ({
      marketplace_id: listing.source,
      external_id: listing.externalId,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      currency: listing.currency,
      url: listing.url,
      image_url: listing.imageUrls[0] ?? null,
      seller_name: listing.sellerName,
      location: listing.location,
      category: listing.category,
      condition: listing.condition,
      latitude: listing.latitude,
      longitude: listing.longitude,
      posted_at: listing.postedAt,
      fetched_at: observedAt,
      last_seen_at: observedAt,
      is_active: true,
      normalized_data: listing.product ?? {},
      raw_data: {
        ...(listing.metadata ?? {}),
        imageUrls: listing.imageUrls,
        ...(listing.qualitySignals ? { qualitySignals: listing.qualitySignals } : {}),
        ...(identityAssignments.has(listingIdentity(listing.source, listing.externalId))
          ? {
              productIdentity: identityAssignments.get(
                listingIdentity(listing.source, listing.externalId),
              )?.snapshot,
            }
          : {}),
      },
      ...(identityAssignments.has(listingIdentity(listing.source, listing.externalId))
        ? {
            product_identity_id:
              identityAssignments.get(listingIdentity(listing.source, listing.externalId))
                ?.productIdentityId ?? null,
            product_variant_id:
              identityAssignments.get(listingIdentity(listing.source, listing.externalId))
                ?.productVariantId ?? null,
            identity_match_status: identityAssignments.get(
              listingIdentity(listing.source, listing.externalId),
            )?.snapshot.matchStatus,
            identity_match_method: identityAssignments.get(
              listingIdentity(listing.source, listing.externalId),
            )?.snapshot.matchMethod,
            identity_match_confidence: identityAssignments.get(
              listingIdentity(listing.source, listing.externalId),
            )?.snapshot.confidence,
            product_identity_data: identityAssignments.get(
              listingIdentity(listing.source, listing.externalId),
            )?.snapshot,
          }
        : {}),
    }));

    const { data, error } = await this.client
      .from("listings")
      .upsert(rows, { onConflict: "marketplace_id,external_id", ignoreDuplicates: false })
      .select(
        "id,marketplace_id,external_id,product_identity_id,product_variant_id,identity_match_status,identity_match_method,identity_match_confidence,product_identity_data",
      )
      .returns<StoredListingReference[]>();

    if (error) {
      throw error;
    }

    const storedListings = data ?? [];
    const listingIdsByIdentity = new Map(
      storedListings.map((listing) => [
        listingIdentity(listing.marketplace_id, listing.external_id),
        listing.id,
      ]),
    );
    const observations = uniqueListings
      .map((listing) => {
        const currency = normalizeCurrency(listing.currency);
        const listingId = listingIdsByIdentity.get(
          listingIdentity(listing.source, listing.externalId),
        );
        if (listing.price === null || !currency || !listingId) {
          return null;
        }

        return {
          listing_id: listingId,
          observed_at: observedAt,
          price: listing.price,
          currency,
        };
      })
      .filter(
        (observation): observation is NonNullable<typeof observation> => observation !== null,
      );

    if (observations.length > 0) {
      const { error: observationError } = await this.client
        .from("listing_price_observations")
        .upsert(observations, {
          onConflict: "listing_id,observed_at,price,currency",
          ignoreDuplicates: true,
        });

      if (observationError) {
        throw observationError;
      }
    }

    const productObservations = buildProductPriceObservationRows(
      uniqueListings,
      storedListings,
      observedAt,
    );
    if (productObservations.length > 0) {
      const { error: productObservationError } = await this.client
        .from("product_price_observations")
        .upsert(productObservations, {
          onConflict: "product_variant_id,marketplace_id,external_id,observed_at,price,currency",
          ignoreDuplicates: true,
        });

      if (productObservationError) {
        throw productObservationError;
      }
    }

    return storedListings;
  }

  async getActiveListingsForSources(
    sources: readonly MarketplaceSource[],
  ): Promise<ActiveStoredListing[]> {
    const uniqueSources = [...new Set(sources)];
    if (uniqueSources.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("listings")
      .select(
        "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,raw_data,normalized_data,product_identity_id,product_variant_id,identity_match_status,identity_match_method,identity_match_confidence,product_identity_data",
      )
      .in("marketplace_id", uniqueSources)
      .eq("is_active", true)
      .returns<StoredListing[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).map((stored) => ({ stored, listing: toMarketplaceListing(stored) }));
  }

  async createMatches(
    watchlist: MarketplaceWatchlist,
    listings: MarketplaceListing[],
    storedListings: StoredListingReference[],
  ) {
    if (!isWatchlistMonitorable(watchlist)) {
      return 0;
    }

    const listingIdsByIdentity = new Map(
      storedListings.map((listing) => [
        listingIdentity(listing.marketplace_id, listing.external_id),
        listing.id,
      ]),
    );
    const rows = deduplicateIngestionListings(listings)
      .filter((listing) => matchesWatchlist(watchlist, listing))
      .map((listing) => ({
        user_id: watchlist.userId,
        watchlist_id: watchlist.id,
        listing_id: listingIdsByIdentity.get(listingIdentity(listing.source, listing.externalId)),
      }))
      .filter((match): match is { user_id: string; watchlist_id: string; listing_id: string } =>
        Boolean(match.listing_id),
      );

    if (rows.length === 0) {
      return 0;
    }

    const { data, error } = await this.client
      .from("matches")
      .upsert(rows, {
        onConflict: "watchlist_id,listing_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      throw error;
    }

    return data?.length ?? 0;
  }

  processNotificationQueue(): Promise<NotificationDeliverySummary> {
    return processNotificationQueue(this.client);
  }

  getNotificationQueueHealth(): Promise<NotificationQueueHealth> {
    return getNotificationQueueHealth(this.client);
  }

  async markWatchlistChecked(watchlistId: string) {
    const { error } = await this.client
      .from("watchlists")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", watchlistId);

    if (error) {
      throw error;
    }
  }

  private async loadActiveWatchlists() {
    const { data, error } = await this.client
      .from("watchlists")
      .select(
        "id,user_id,search_query,filters,alert_mode,marketplace_id,marketplace_scope,lifecycle_state,snoozed_until,completed_at,watchlist_marketplaces(marketplace_id)",
      )
      .order("updated_at", { ascending: true })
      .returns<StoredWatchlist[]>();

    if (error) {
      throw error;
    }

    return (data ?? []).filter((watchlist) => isStoredWatchlistMonitorable(watchlist));
  }
}

export function isWatchlistMonitorable(
  watchlist: Pick<MarketplaceWatchlist, "lifecycleState" | "snoozedUntil">,
  now = new Date(),
) {
  if (watchlist.lifecycleState === "paused" || watchlist.lifecycleState === "completed") {
    return false;
  }

  if (watchlist.lifecycleState === "snoozed") {
    const snoozedUntil = watchlist.snoozedUntil ? new Date(watchlist.snoozedUntil) : null;
    return Boolean(snoozedUntil && Number.isFinite(snoozedUntil.getTime()) && snoozedUntil <= now);
  }

  return true;
}

function isStoredWatchlistMonitorable(watchlist: StoredWatchlist, now = new Date()) {
  return isWatchlistMonitorable(
    {
      lifecycleState: watchlist.lifecycle_state ?? (watchlist.snoozed_until ? "snoozed" : "active"),
      snoozedUntil: watchlist.snoozed_until ?? null,
    },
    now,
  );
}

function toMarketplaceListing(stored: StoredListing): MarketplaceListing {
  return {
    source: marketplaceSource(stored.marketplace_id),
    externalId: stored.external_id,
    title: stored.title,
    description: stored.description,
    price: stored.price,
    currency: stored.currency,
    url: stored.url,
    imageUrls: extractImageUrls(stored),
    sellerName: stored.seller_name,
    location: stored.location,
    category: stored.category,
    condition: stored.condition,
    latitude: stored.latitude,
    longitude: stored.longitude,
    postedAt: stored.posted_at,
    ...(isMarketplaceProductMetadata(stored.normalized_data)
      ? { product: stored.normalized_data }
      : {}),
    qualitySignals: isMarketplaceListingQualitySignals(stored.raw_data.qualitySignals)
      ? stored.raw_data.qualitySignals
      : createUnknownListingQualitySignals(),
    metadata: {
      ...stored.raw_data,
      ...(stored.product_identity_data ? { productIdentity: stored.product_identity_data } : {}),
    },
  };
}

function toMarketplaceWatchlist(
  stored: StoredWatchlist,
  availableSources: readonly MarketplaceSource[],
): MarketplaceWatchlist {
  const available = [...new Set(availableSources)].sort();
  const storedMarketplaceIds = (stored.watchlist_marketplaces ?? [])
    .map(({ marketplace_id }) => marketplaceSourceOrNull(marketplace_id))
    .filter((source): source is MarketplaceSource => source !== null);
  const legacyMarketplaceId = marketplaceSourceOrNull(stored.marketplace_id);
  const selectedMarketplaceIds = [
    ...new Set(storedMarketplaceIds.length > 0 ? storedMarketplaceIds : [legacyMarketplaceId]),
  ].filter((source): source is MarketplaceSource => source !== null && available.includes(source));
  const marketplaceScope: WatchlistMarketplaceScope =
    stored.marketplace_scope === "all" ? "all" : "selected";

  return {
    id: stored.id,
    userId: stored.user_id,
    searchQuery: stored.search_query,
    filters: stored.filters,
    alertMode: stored.alert_mode ?? "instant",
    marketplaceScope,
    marketplaceIds: marketplaceScope === "all" ? available : selectedMarketplaceIds,
    lifecycleState: stored.lifecycle_state ?? "active",
    snoozedUntil: stored.snoozed_until ?? null,
    completedAt: stored.completed_at ?? null,
  };
}

function marketplaceSource(value: string) {
  const source = marketplaceSourceOrNull(value);
  if (!source) {
    throw new Error(`Stored listing references an unsupported marketplace: ${value}.`);
  }

  return source;
}

function marketplaceSourceOrNull(value: string | undefined) {
  return Object.values(MARKETPLACE_IDS).find((marketplaceId) => marketplaceId === value) ?? null;
}

function listingIdentity(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

function extractImageUrls(stored: StoredListing) {
  const rawImages = stored.raw_data.imageUrls ?? stored.raw_data.images;
  const imageUrls = Array.isArray(rawImages)
    ? rawImages.filter((image): image is string => typeof image === "string")
    : [];

  return [
    ...new Set([stored.image_url, ...imageUrls].filter((image): image is string => Boolean(image))),
  ];
}

function normalizeCurrency(currency: string | null) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
