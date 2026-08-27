import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateWeeklySummary, type WeeklySummaryMatch } from "../analytics/weekly-summary";
import type { ProductEventInput } from "../analytics/events";
import { ListingRepository } from "../database/listing-repository";
import type { MarketplaceComparisonOffer } from "../marketplaces/comparison/types";
import type { MarketplaceListing, MarketplaceSource } from "../marketplaces/shared/types";
import {
  summarizePriceHistory,
  summarizeProductPriceHistory,
  type PriceHistorySummary,
} from "../pricing/price-history";
import { summarizeSourcingPriceHistory } from "../sourcing/price-history";
import { PRO_FEATURES, PRO_LIMITS } from "./pro";
import type { WatchlistFilters } from "../types/backend";
import type {
  ApiComparisonManualGroupInput,
  ApiComparisonShortlistInput,
  ApiDealRoomInput,
  ApiDealRoomRole,
  ApiDealRoomInvitation,
  ApiDealRoomComment,
  ApiDealRoomActivity,
  ApiDealRoomItemInput,
  ApiDealRoomItemUpdateInput,
  ApiDealRoomUpdateInput,
  ApiSupplierFilters,
  ApiSupplierInput,
  ApiSupplierUpdateInput,
  ApiPriceTarget,
  ApiNotificationPreferences,
  ApiShoppingPreferencesInput,
  ApiProductCaptureInput,
  ApiProductCaptureStatusUpdate,
  ApiProEntitlement,
  ApiSourcingListImportInput,
  ApiSourcingListInput,
  ApiSourcingListProductInput,
  ApiSourcingListProductUpdateInput,
  ApiSourcingListUpdateInput,
  ApiSourcingExportRow,
  ApiSourcingPriceHistory,
  ApiSourcingSummary,
  ApiWorkspaceInput,
  ApiWorkspaceMemberInput,
  ListingProblemReportInput,
  ApiWeeklySummary,
  RawApiWorkspace,
  RawApiWorkspaceMember,
  RawApiListing,
  RawApiMatch,
  RawApiNotification,
  RawApiShoppingPreferences,
  RawApiSourcingList,
  RawApiSourcingActivity,
  RawApiSourcingNote,
  RawApiProductCapture,
  RawApiSourcingPriceObservation,
  RawApiComparisonManualGroup,
  RawApiComparisonShortlist,
  RawApiDealRoom,
  RawApiDealRoomActivity,
  RawApiDealRoomComment,
  RawApiDealRoomMember,
  RawApiDealRoomItem,
  RawApiSupplier,
  RawApiSupplierShortlistHistory,
  RawApiWatchlist,
  StoredListingReference,
} from "./types";

const WATCHLIST_COLUMNS =
  "id,user_id,marketplace_id,marketplace_scope,alert_mode,name,search_query,filters,is_active,is_favorite,lifecycle_state,snoozed_until,completed_at,last_checked_at,created_at,updated_at,watchlist_marketplaces(marketplace_id)";
const LISTING_COLUMNS =
  "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,first_seen_at,last_seen_at,is_active,raw_data,product_identity_id,product_variant_id,identity_match_status,identity_match_method,identity_match_confidence,product_identity_data";
const MATCH_LISTING_COLUMNS =
  "id,marketplace_id,external_id,title,description,price,currency,url,image_url,seller_name,location,category,condition,latitude,longitude,posted_at,fetched_at,first_seen_at,last_seen_at,is_active,raw_data,product_identity_id,product_variant_id,identity_match_status,identity_match_method,identity_match_confidence,product_identity_data";
const WORKSPACE_COLUMNS =
  "id,owner_id,name,business_type,primary_sourcing_categories,default_currency,country_region,created_at,updated_at";
const SOURCING_LIST_COLUMNS =
  "id,workspace_id,created_by,name,status,target_budget,target_budget_currency,created_at,updated_at";
const SOURCING_LIST_PRODUCT_COLUMNS =
  "id,sourcing_list_id,category,product_name,sku,upc,gtin,mpn,keywords,target_quantity,sourced_quantity,target_unit_cost,target_unit_cost_currency,max_unit_cost,max_unit_cost_currency,estimated_shipping_cost,estimated_shipping_currency,estimated_duties_taxes,estimated_duties_taxes_currency,other_sourcing_cost,other_sourcing_cost_currency,desired_retail_price,desired_retail_price_currency,minimum_desired_margin_percent,desired_roi_percent,estimated_resale_fees,estimated_resale_fees_currency,max_landed_unit_cost,max_landed_unit_cost_currency,alert_cost_basis,alert_enabled,alert_target_price_reached,alert_new_cheaper_source,alert_price_dropped,alert_quantity_available,alert_back_in_stock,alert_cooldown_minutes,preferred_condition,notes,required_by,assigned_to,workflow_status,sort_order,created_at,updated_at,sourcing_list_product_marketplaces(marketplace_id)";
const COMPARISON_SHORTLIST_COLUMNS =
  "id,workspace_id,sourcing_list_product_id,marketplace_id,external_id,listing_id,supplier_id,offer_snapshot,created_by,created_at";
const COMPARISON_GROUP_COLUMNS =
  "id,workspace_id,sourcing_list_product_id,member_refs,created_by,created_at,updated_at";
const SUPPLIER_COLUMNS =
  "id,workspace_id,name,marketplace_id,marketplace_seller_id,supplier_url,notes,tags,status,internal_contact_info,typical_lead_time_days,minimum_order_quantity,created_by,created_at,updated_at";
const SUPPLIER_HISTORY_COLUMNS =
  "id,workspace_id,supplier_id,sourcing_list_product_id,marketplace_id,external_id,listing_id,offer_snapshot,first_shortlisted_at,last_shortlisted_at,last_shortlisted_by";
const PRODUCT_CAPTURE_COLUMNS =
  "id,user_id,capture_source,url,raw_text,barcode,barcode_format,image_reference,country,preferred_currency,status,normalized_product,candidate_products,missing_fields,failure_reason,created_at,updated_at,processed_at";
const DEAL_ROOM_COLUMNS =
  "id,user_id,name,description,cover_image_url,visibility,created_at,updated_at";
const DEAL_ROOM_ITEM_COLUMNS =
  "id,room_id,item_type,product_identity_id,listing_id,watchlist_id,is_shortlisted,shortlisted_at,shortlisted_by,sort_order,created_at,updated_at";
const DEAL_ROOM_MEMBER_COLUMNS = "user_id,role,created_at";
const DEAL_ROOM_COMMENT_COLUMNS = "id,item_id,user_id,body,created_at,updated_at";
const DEAL_ROOM_ACTIVITY_COLUMNS = "id,room_id,item_id,actor_id,event_type,metadata,created_at";

type DealRoomRow = Omit<RawApiDealRoom, "items" | "role" | "is_member" | "member_count">;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StoredMatch extends RawApiMatch {
  favorite: boolean;
  feedback: NonNullable<RawApiMatch["feedback"]> | null;
}

export interface MatchQueryOptions {
  status?: "dismissed";
}

export interface StoredWorkspace extends RawApiWorkspace {}

export interface StoredListingAccess {
  listing: RawApiListing;
  matchedAt: string | null;
  isFavorite: boolean;
  priceHistory?: PriceHistorySummary | null;
  priceTarget?: ApiPriceTarget | null;
}

export interface StoredFavoriteListing extends StoredListingAccess {
  savedAt: string;
}

interface StoredListingMatch {
  matched_at: string;
  watchlist: { filters: WatchlistFilters } | Array<{ filters: WatchlistFilters }> | null;
}

interface StoredPriceObservation {
  price: number;
  currency: string;
  observed_at: string;
}

interface StoredProductPriceObservation extends StoredPriceObservation {
  marketplace_id: string;
  shipping_price: number | string | null;
  shipping_currency: string | null;
  condition: string | null;
}

interface SourcingListImportRpcRow {
  imported_count: number;
  duplicate_import: boolean;
}

function isSourcingListImportRpcRow(value: unknown): value is SourcingListImportRpcRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return typeof row.imported_count === "number" && typeof row.duplicate_import === "boolean";
}

interface WeeklyMatchRow {
  id: string;
  watchlist_id: string;
  listing_id: string;
  status: "unread" | "read" | "dismissed";
  matched_at: string;
  listing:
    | { price: number | null; currency: string | null }
    | Array<{ price: number | null; currency: string | null }>
    | null;
}

interface WeeklyWatchlistRow {
  id: string;
  name: string;
}

export interface MobileApiRepositoryContract {
  getWorkspaces(userId: string): Promise<StoredWorkspace[]>;
  getWorkspace(userId: string, workspaceId: string): Promise<StoredWorkspace | null>;
  createWorkspace(userId: string, input: ApiWorkspaceInput): Promise<StoredWorkspace>;
  getWorkspaceMembers(userId: string, workspaceId: string): Promise<RawApiWorkspaceMember[]>;
  getDealRooms(userId: string): Promise<RawApiDealRoom[]>;
  getDealRoom(userId: string | null, roomId: string): Promise<RawApiDealRoom | null>;
  createDealRoom(userId: string, input: ApiDealRoomInput): Promise<RawApiDealRoom>;
  updateDealRoom(
    userId: string,
    roomId: string,
    input: ApiDealRoomUpdateInput,
  ): Promise<RawApiDealRoom | null>;
  deleteDealRoom(userId: string, roomId: string): Promise<boolean>;
  addDealRoomItem(
    userId: string,
    roomId: string,
    input: ApiDealRoomItemInput,
  ): Promise<RawApiDealRoomItem | null>;
  updateDealRoomItem(
    userId: string,
    roomId: string,
    itemId: string,
    input: ApiDealRoomItemUpdateInput,
  ): Promise<RawApiDealRoomItem | null>;
  deleteDealRoomItem(userId: string, roomId: string, itemId: string): Promise<boolean>;
  getDealRoomMembers(userId: string, roomId: string): Promise<RawApiDealRoomMember[]>;
  createDealRoomInvitation(
    userId: string,
    roomId: string,
    input: { email: string; role: Exclude<ApiDealRoomRole, "owner"> },
  ): Promise<ApiDealRoomInvitation | null>;
  acceptDealRoomInvitation(userId: string, token: string): Promise<RawApiDealRoom | null>;
  getDealRoomComments(
    userId: string,
    roomId: string,
    itemId: string,
  ): Promise<RawApiDealRoomComment[]>;
  createDealRoomComment(
    userId: string,
    roomId: string,
    itemId: string,
    body: string,
  ): Promise<RawApiDealRoomComment | null>;
  deleteDealRoomComment(userId: string, roomId: string, commentId: string): Promise<boolean>;
  setDealRoomItemVote(
    userId: string,
    roomId: string,
    itemId: string,
    prefer: boolean,
  ): Promise<boolean>;
  getDealRoomActivity(userId: string, roomId: string): Promise<RawApiDealRoomActivity[]>;
  inviteWorkspaceMember(
    userId: string,
    workspaceId: string,
    input: ApiWorkspaceMemberInput,
  ): Promise<RawApiWorkspaceMember | null>;
  persistListings(listings: MarketplaceListing[]): Promise<StoredListingReference[]>;
  getListingForUser(userId: string, listingId: string): Promise<StoredListingAccess | null>;
  setListingFavorite(userId: string, listingId: string, isFavorite: boolean): Promise<boolean>;
  recordProductEvent(userId: string, input: ProductEventInput): Promise<void>;
  createProductCapture?(
    userId: string,
    input: ApiProductCaptureInput,
  ): Promise<RawApiProductCapture>;
  updateProductCapture?(
    userId: string,
    captureId: string,
    input: ApiProductCaptureStatusUpdate,
  ): Promise<RawApiProductCapture | null>;
  getProductCapture?(userId: string, captureId: string): Promise<RawApiProductCapture | null>;
  getProEntitlement?(userId: string, workspaceId?: string): Promise<ApiProEntitlement>;
  createListingProblemReport(
    userId: string,
    requestId: string,
    input: ListingProblemReportInput,
  ): Promise<string | null>;
  getWatchlists(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiWatchlist>>;
  getWatchlist(userId: string, watchlistId: string): Promise<RawApiWatchlist | null>;
  createWatchlist(
    userId: string,
    input: {
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      alertMode: "instant" | "digest";
    },
  ): Promise<RawApiWatchlist>;
  updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Partial<{
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      alertMode: "instant" | "digest";
      lifecycleState: "active" | "paused" | "snoozed" | "completed";
      snoozedUntil: string | null;
      completedAt: string | null;
    }>,
  ): Promise<RawApiWatchlist | null>;
  deleteWatchlist(userId: string, watchlistId: string): Promise<boolean>;
  getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
    includeDismissed?: boolean,
    options?: MatchQueryOptions,
  ): Promise<Page<StoredMatch>>;
  getFavoriteListings(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<StoredFavoriteListing>>;
  setMatchStatus(
    userId: string,
    matchId: string,
    status: NonNullable<RawApiMatch["status"]>,
  ): Promise<boolean>;
  setMatchFeedback(
    userId: string,
    matchId: string,
    feedback: NonNullable<RawApiMatch["feedback"]> | null,
  ): Promise<boolean>;
  getNotifications(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiNotification>>;
  markNotificationRead(userId: string, notificationId: string): Promise<boolean>;
  getNotificationPreferences(userId: string): Promise<ApiNotificationPreferences>;
  updateNotificationPreferences(
    userId: string,
    preferences: ApiNotificationPreferences,
  ): Promise<ApiNotificationPreferences>;
  getShoppingPreferences?(userId: string): Promise<RawApiShoppingPreferences>;
  updateShoppingPreferences?(
    userId: string,
    preferences: ApiShoppingPreferencesInput,
  ): Promise<RawApiShoppingPreferences>;
  registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ): Promise<void>;
  getWeeklySummary(userId: string): Promise<ApiWeeklySummary>;
  getSourcingLists?(
    userId: string,
    workspaceId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiSourcingList>>;
  getSourcingList?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<RawApiSourcingList | null>;
  getSourcingSummary?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<ApiSourcingSummary | null>;
  createSourcingList?(
    userId: string,
    workspaceId: string,
    input: ApiSourcingListInput,
  ): Promise<RawApiSourcingList | null>;
  updateSourcingList?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListUpdateInput,
  ): Promise<RawApiSourcingList | null>;
  duplicateSourcingList?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    name?: string,
  ): Promise<RawApiSourcingList | null>;
  importSourcingListProducts?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListImportInput,
  ): Promise<{
    list: RawApiSourcingList;
    imported_count: number;
    duplicate_import: boolean;
  } | null>;
  addSourcingListProduct?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListProductInput,
  ): Promise<RawApiSourcingList | null>;
  updateSourcingListProduct?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
    input: ApiSourcingListProductUpdateInput,
  ): Promise<RawApiSourcingList | null>;
  deleteSourcingListProduct?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
  ): Promise<boolean>;
  getSuppliers?(
    userId: string,
    workspaceId: string,
    filters?: ApiSupplierFilters,
  ): Promise<RawApiSupplier[]>;
  createSupplier?(
    userId: string,
    workspaceId: string,
    input: ApiSupplierInput,
  ): Promise<RawApiSupplier | null>;
  updateSupplier?(
    userId: string,
    workspaceId: string,
    supplierId: string,
    input: ApiSupplierUpdateInput,
  ): Promise<RawApiSupplier | null>;
  deleteSupplier?(userId: string, workspaceId: string, supplierId: string): Promise<boolean>;
  getSupplierShortlistHistory?(
    userId: string,
    workspaceId: string,
    supplierId: string,
  ): Promise<RawApiSupplierShortlistHistory[] | null>;
  getComparisonState?(
    userId: string,
    workspaceId: string,
    sourcingListProductId: string,
  ): Promise<{
    shortlists: RawApiComparisonShortlist[];
    manualGroups: RawApiComparisonManualGroup[];
  } | null>;
  upsertComparisonShortlist?(
    userId: string,
    workspaceId: string,
    input: ApiComparisonShortlistInput,
  ): Promise<RawApiComparisonShortlist | null>;
  deleteComparisonShortlist?(
    userId: string,
    workspaceId: string,
    shortlistId: string,
  ): Promise<boolean>;
  createComparisonManualGroup?(
    userId: string,
    workspaceId: string,
    input: ApiComparisonManualGroupInput,
  ): Promise<RawApiComparisonManualGroup | null>;
  deleteComparisonManualGroup?(
    userId: string,
    workspaceId: string,
    groupId: string,
  ): Promise<boolean>;
  getSourcingProductPriceHistory?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    sourcingListProductId: string,
  ): Promise<ApiSourcingPriceHistory | null>;
  getSourcingNotes?(
    userId: string,
    workspaceId: string,
    sourcingListProductId: string,
    comparisonShortlistId?: string,
  ): Promise<RawApiSourcingNote[] | null>;
  createSourcingNote?(
    userId: string,
    workspaceId: string,
    input: {
      sourcingListProductId?: string | null;
      comparisonShortlistId?: string | null;
      body: string;
    },
  ): Promise<RawApiSourcingNote | null>;
  getSourcingActivity?(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<RawApiSourcingActivity[] | null>;
}

export class MobileApiRepository implements MobileApiRepositoryContract {
  private readonly listingRepository: ListingRepository;

  constructor(private readonly client: SupabaseClient) {
    this.listingRepository = new ListingRepository(client);
  }

  async getProEntitlement(userId: string, workspaceId?: string): Promise<ApiProEntitlement> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("pro_entitlements")
      .select("id,user_id,workspace_id,plan,source,starts_at,expires_at,revoked_at")
      .eq("plan", "pro")
      .is("revoked_at", null)
      .lte("starts_at", now)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .returns<
        Array<{
          id: string;
          user_id: string | null;
          workspace_id: string | null;
          plan: "pro";
          source: ApiProEntitlement["source"];
          starts_at: string;
          expires_at: string | null;
          revoked_at: string | null;
        }>
      >();

    if (error) {
      throw error;
    }

    let memberWorkspaceIds: string[] = [];
    if (!workspaceId) {
      const { data: memberships, error: membershipsError } = await this.client
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .returns<Array<{ workspace_id: string }>>();
      if (membershipsError) {
        throw membershipsError;
      }
      memberWorkspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);
    }

    const entitlement = (data ?? []).find(
      (candidate) =>
        (!candidate.expires_at || candidate.expires_at > now) &&
        (candidate.user_id === userId || candidate.user_id === null) &&
        (workspaceId
          ? candidate.workspace_id === workspaceId || candidate.workspace_id === null
          : candidate.workspace_id === null || memberWorkspaceIds.includes(candidate.workspace_id)),
    );

    if (!entitlement) {
      return {
        isPro: false,
        plan: "free",
        source: null,
        startsAt: null,
        expiresAt: null,
        workspaceId: null,
        features: [],
        limits: null,
      };
    }

    return {
      isPro: true,
      plan: "pro",
      source: entitlement.source,
      startsAt: entitlement.starts_at,
      expiresAt: entitlement.expires_at,
      workspaceId: entitlement.workspace_id,
      features: [...PRO_FEATURES],
      limits: PRO_LIMITS,
    };
  }

  async getWorkspaces(userId: string): Promise<StoredWorkspace[]> {
    const { data: memberships, error: membershipError } = await this.client
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("user_id", userId)
      .returns<Array<{ workspace_id: string; role: RawApiWorkspace["role"] }>>();

    if (membershipError) {
      throw membershipError;
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const workspaceIds = memberships.map((membership) => membership.workspace_id);
    const roles = new Map(
      memberships.map((membership) => [membership.workspace_id, membership.role]),
    );
    const { data: workspaces, error: workspaceError } = await this.client
      .from("workspaces")
      .select(WORKSPACE_COLUMNS)
      .in("id", workspaceIds)
      .order("created_at", { ascending: false })
      .returns<Omit<RawApiWorkspace, "role">[]>();

    if (workspaceError) {
      throw workspaceError;
    }

    return (workspaces ?? []).map((workspace) => ({
      ...workspace,
      role: roles.get(workspace.id) ?? "viewer",
    }));
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<StoredWorkspace | null> {
    const { data: membership, error: membershipError } = await this.client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ role: RawApiWorkspace["role"] }>();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      return null;
    }

    const { data: workspace, error: workspaceError } = await this.client
      .from("workspaces")
      .select(WORKSPACE_COLUMNS)
      .eq("id", workspaceId)
      .maybeSingle<Omit<RawApiWorkspace, "role">>();

    if (workspaceError) {
      throw workspaceError;
    }

    return workspace ? { ...workspace, role: membership.role } : null;
  }

  async createWorkspace(userId: string, input: ApiWorkspaceInput): Promise<StoredWorkspace> {
    const { data: workspace, error } = await this.client
      .from("workspaces")
      .insert({
        owner_id: userId,
        name: input.name,
        business_type: input.businessType,
        primary_sourcing_categories: input.primarySourcingCategories,
        default_currency: input.defaultCurrency,
        country_region: input.countryRegion,
      })
      .select(WORKSPACE_COLUMNS)
      .single<Omit<RawApiWorkspace, "role">>();

    if (error) {
      throw error;
    }

    return { ...workspace, role: "owner" };
  }

  async getWorkspaceMembers(userId: string, workspaceId: string): Promise<RawApiWorkspaceMember[]> {
    if (!(await this.getWorkspace(userId, workspaceId))) {
      return [];
    }

    const { data: memberships, error: membershipError } = await this.client
      .from("workspace_members")
      .select("user_id,role,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .returns<
        Array<{ user_id: string; role: RawApiWorkspaceMember["role"]; created_at: string }>
      >();
    if (membershipError) throw membershipError;

    const ids = (memberships ?? []).map((member) => member.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: profileError } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", ids)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (profileError) throw profileError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return (memberships ?? []).map((member) => ({
      user_id: member.user_id,
      role: member.role,
      created_at: member.created_at,
      email: profileById.get(member.user_id)?.email ?? null,
      full_name: profileById.get(member.user_id)?.full_name ?? null,
    }));
  }

  async inviteWorkspaceMember(
    userId: string,
    workspaceId: string,
    input: ApiWorkspaceMemberInput,
  ): Promise<RawApiWorkspaceMember | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || workspace.role !== "owner") return null;

    const { data: profile, error: profileError } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .ilike("email", input.email)
      .maybeSingle<{ id: string; email: string | null; full_name: string | null }>();
    if (profileError) throw profileError;
    if (!profile) return null;

    const { error } = await this.client.from("workspace_members").upsert(
      {
        workspace_id: workspaceId,
        user_id: profile.id,
        role: input.role,
      },
      { onConflict: "workspace_id,user_id" },
    );
    if (error) throw error;

    return {
      user_id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: input.role,
      created_at: new Date().toISOString(),
    };
  }

  async getDealRooms(userId: string): Promise<RawApiDealRoom[]> {
    const { data: memberships, error: membershipError } = await this.client
      .from("deal_room_members")
      .select("room_id,role")
      .eq("user_id", userId)
      .returns<Array<{ room_id: string; role: ApiDealRoomRole }>>();
    if (membershipError) throw membershipError;

    const membershipRoles = new Map(
      (memberships ?? []).map((membership) => [membership.room_id, membership.role]),
    );
    if (membershipRoles.size === 0) {
      return [];
    }
    const { data, error } = await this.client
      .from("deal_rooms")
      .select(DEAL_ROOM_COLUMNS)
      .in("id", [...membershipRoles.keys()])
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .returns<DealRoomRow[]>();

    if (error) {
      throw error;
    }

    return Promise.all(
      (data ?? []).map((room) =>
        this.withDealRoomItems(
          {
            ...room,
            role: membershipRoles.get(room.id) ?? "viewer",
            is_member: true,
            member_count: 0,
          },
          userId,
        ),
      ),
    );
  }

  async getDealRoom(userId: string | null, roomId: string): Promise<RawApiDealRoom | null> {
    const { data, error } = await this.client
      .from("deal_rooms")
      .select(DEAL_ROOM_COLUMNS)
      .eq("id", roomId)
      .maybeSingle<DealRoomRow>();
    if (error) {
      throw error;
    }
    if (!data) return null;

    const role = userId ? await this.getDealRoomRole(userId, roomId, data.user_id) : null;
    if (data.visibility !== "public" && !role) return null;

    return this.withDealRoomItems(
      {
        ...data,
        role: role ?? "viewer",
        is_member: Boolean(role),
        member_count: 0,
      },
      userId,
    );
  }

  async createDealRoom(userId: string, input: ApiDealRoomInput): Promise<RawApiDealRoom> {
    const { data, error } = await this.client
      .from("deal_rooms")
      .insert({
        user_id: userId,
        name: input.name,
        description: input.description ?? null,
        cover_image_url: input.coverImageUrl ?? null,
        visibility: input.visibility ?? "private",
      })
      .select(DEAL_ROOM_COLUMNS)
      .single<DealRoomRow>();

    if (error) {
      throw error;
    }

    return (
      (await this.getDealRoom(userId, data.id)) ?? {
        ...data,
        role: "owner",
        is_member: true,
        member_count: 1,
        items: [],
      }
    );
  }

  async updateDealRoom(
    userId: string,
    roomId: string,
    input: ApiDealRoomUpdateInput,
  ): Promise<RawApiDealRoom | null> {
    const values: Record<string, unknown> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.coverImageUrl !== undefined) values.cover_image_url = input.coverImageUrl;
    if (input.visibility !== undefined) values.visibility = input.visibility;

    const { data, error } = await this.client
      .from("deal_rooms")
      .update(values)
      .eq("id", roomId)
      .eq("user_id", userId)
      .select(DEAL_ROOM_COLUMNS)
      .maybeSingle<DealRoomRow>();

    if (error) {
      throw error;
    }

    return data ? this.getDealRoom(userId, data.id) : null;
  }

  async deleteDealRoom(userId: string, roomId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("deal_rooms")
      .delete()
      .eq("id", roomId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async addDealRoomItem(
    userId: string,
    roomId: string,
    input: ApiDealRoomItemInput,
  ): Promise<RawApiDealRoomItem | null> {
    if (!(await this.canContributeToDealRoom(userId, roomId))) {
      return null;
    }

    if (!(await this.canAddDealRoomReference(userId, input))) {
      return null;
    }

    let existingQuery = this.client
      .from("deal_room_items")
      .select(DEAL_ROOM_ITEM_COLUMNS)
      .eq("room_id", roomId)
      .eq("item_type", input.itemType);
    if (input.productIdentityId) {
      existingQuery = existingQuery.eq("product_identity_id", input.productIdentityId);
    } else if (input.listingId) {
      existingQuery = existingQuery.eq("listing_id", input.listingId);
    } else if (input.watchlistId) {
      existingQuery = existingQuery.eq("watchlist_id", input.watchlistId);
    }

    const { data: existing, error: existingError } =
      await existingQuery.maybeSingle<RawApiDealRoomItem>();
    if (existingError) {
      throw existingError;
    }
    if (existing) {
      return this.findDealRoomItem(userId, roomId, existing.id);
    }

    const { data: lastItem, error: lastItemError } = await this.client
      .from("deal_room_items")
      .select("sort_order")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    if (lastItemError) {
      throw lastItemError;
    }

    const { data: item, error } = await this.client
      .from("deal_room_items")
      .insert({
        room_id: roomId,
        item_type: input.itemType,
        product_identity_id: input.productIdentityId ?? null,
        listing_id: input.listingId ?? null,
        watchlist_id: input.watchlistId ?? null,
        sort_order: (lastItem?.sort_order ?? -1) + 1,
      })
      .select(DEAL_ROOM_ITEM_COLUMNS)
      .single<RawApiDealRoomItem>();
    if (error) {
      throw error;
    }

    await this.recordDealRoomActivity(userId, roomId, item.id, "item_added", {
      itemType: input.itemType,
    });
    return this.findDealRoomItem(userId, roomId, item.id);
  }

  async updateDealRoomItem(
    userId: string,
    roomId: string,
    itemId: string,
    input: ApiDealRoomItemUpdateInput,
  ): Promise<RawApiDealRoomItem | null> {
    if (!(await this.canContributeToDealRoom(userId, roomId))) {
      return null;
    }

    const values: Record<string, unknown> = {};
    if (input.sortOrder !== undefined) values.sort_order = input.sortOrder;
    if (input.isShortlisted !== undefined) {
      values.is_shortlisted = input.isShortlisted;
      values.shortlisted_at = input.isShortlisted ? new Date().toISOString() : null;
      values.shortlisted_by = input.isShortlisted ? userId : null;
    }

    const { data, error } = await this.client
      .from("deal_room_items")
      .update(values)
      .eq("id", itemId)
      .eq("room_id", roomId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    if (data && input.isShortlisted !== undefined) {
      await this.recordDealRoomActivity(userId, roomId, data.id, "item_shortlisted", {
        isShortlisted: input.isShortlisted,
      });
    }
    return data ? this.findDealRoomItem(userId, roomId, data.id) : null;
  }

  async deleteDealRoomItem(userId: string, roomId: string, itemId: string): Promise<boolean> {
    if (!(await this.canContributeToDealRoom(userId, roomId))) {
      return false;
    }

    const { data, error } = await this.client
      .from("deal_room_items")
      .delete()
      .eq("id", itemId)
      .eq("room_id", roomId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async getDealRoomMembers(userId: string, roomId: string): Promise<RawApiDealRoomMember[]> {
    const room = await this.getDealRoom(userId, roomId);
    if (!room?.is_member) {
      return [];
    }

    const { data: memberships, error: membershipError } = await this.client
      .from("deal_room_members")
      .select(DEAL_ROOM_MEMBER_COLUMNS)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .returns<Array<{ user_id: string; role: ApiDealRoomRole; created_at: string }>>();
    if (membershipError) throw membershipError;

    const ids = (memberships ?? []).map((member) => member.user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: profileError } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", ids)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (profileError) throw profileError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return (memberships ?? []).map((member) => ({
      user_id: member.user_id,
      email: profileById.get(member.user_id)?.email ?? null,
      full_name: profileById.get(member.user_id)?.full_name ?? null,
      role: member.role,
      created_at: member.created_at,
    }));
  }

  async createDealRoomInvitation(
    userId: string,
    roomId: string,
    input: { email: string; role: Exclude<ApiDealRoomRole, "owner"> },
  ): Promise<ApiDealRoomInvitation | null> {
    const room = await this.getDealRoom(userId, roomId);
    if (!room || room.role !== "owner") return null;

    const email = input.email.trim().toLowerCase();
    const { data: existingProfile, error: profileError } = await this.client
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle<{ id: string }>();
    if (profileError) throw profileError;
    if (existingProfile && existingProfile.id === userId) return null;

    const { error: removeError } = await this.client
      .from("deal_room_invitations")
      .delete()
      .eq("room_id", roomId)
      .eq("email", email)
      .is("accepted_at", null);
    if (removeError) throw removeError;

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const { data: invitation, error } = await this.client
      .from("deal_room_invitations")
      .insert({
        room_id: roomId,
        email,
        role: input.role,
        token_hash: hashDealRoomInviteToken(token),
        invited_by: userId,
        expires_at: expiresAt,
      })
      .select("id,email,role,expires_at")
      .single<{
        id: string;
        email: string;
        role: Exclude<ApiDealRoomRole, "owner">;
        expires_at: string;
      }>();
    if (error) throw error;

    await this.recordDealRoomActivity(userId, roomId, null, "member_invited", {
      email,
      role: input.role,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      inviteUrl: `dealdrop://deal-room-invite?token=${encodeURIComponent(token)}`,
      expiresAt: invitation.expires_at,
    };
  }

  async acceptDealRoomInvitation(userId: string, token: string): Promise<RawApiDealRoom | null> {
    const { data: profile, error: profileError } = await this.client
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle<{ email: string | null }>();
    if (profileError) throw profileError;
    if (!profile?.email) return null;

    const { data: invitation, error: invitationError } = await this.client
      .from("deal_room_invitations")
      .select("id,room_id,email,role,expires_at,accepted_at")
      .eq("token_hash", hashDealRoomInviteToken(token))
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<{
        id: string;
        room_id: string;
        email: string;
        role: Exclude<ApiDealRoomRole, "owner">;
        expires_at: string;
        accepted_at: string | null;
      }>();
    if (invitationError) throw invitationError;
    if (!invitation || invitation.email !== profile.email.toLowerCase()) return null;

    const { data: room, error: roomError } = await this.client
      .from("deal_rooms")
      .select("id")
      .eq("id", invitation.room_id)
      .maybeSingle<{ id: string }>();
    if (roomError) throw roomError;
    if (!room) return null;

    const { data: existingMember, error: existingMemberError } = await this.client
      .from("deal_room_members")
      .select("role")
      .eq("room_id", invitation.room_id)
      .eq("user_id", userId)
      .maybeSingle<{ role: ApiDealRoomRole }>();
    if (existingMemberError) throw existingMemberError;

    if (!existingMember) {
      const { error } = await this.client.from("deal_room_members").insert({
        room_id: invitation.room_id,
        user_id: userId,
        role: invitation.role,
        invited_by: null,
      });
      if (error) throw error;
    } else if (existingMember.role === "viewer" && invitation.role === "contributor") {
      const { error } = await this.client
        .from("deal_room_members")
        .update({ role: "contributor" })
        .eq("room_id", invitation.room_id)
        .eq("user_id", userId);
      if (error) throw error;
    }

    const { error: acceptError } = await this.client
      .from("deal_room_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invitation.id)
      .is("accepted_at", null);
    if (acceptError) throw acceptError;

    await this.recordDealRoomActivity(userId, invitation.room_id, null, "member_joined", {
      role: invitation.role,
    });
    return this.getDealRoom(userId, invitation.room_id);
  }

  async getDealRoomComments(
    userId: string,
    roomId: string,
    itemId: string,
  ): Promise<RawApiDealRoomComment[]> {
    const room = await this.getDealRoom(userId, roomId);
    if (!room?.is_member || !room.items.some((item) => item.id === itemId)) return [];

    const { data, error } = await this.client
      .from("deal_room_comments")
      .select(DEAL_ROOM_COMMENT_COLUMNS)
      .eq("item_id", itemId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<RawApiDealRoomComment[]>();
    if (error) throw error;

    return this.attachDealRoomCommentAuthors(data ?? []);
  }

  async createDealRoomComment(
    userId: string,
    roomId: string,
    itemId: string,
    body: string,
  ): Promise<RawApiDealRoomComment | null> {
    const room = await this.getDealRoom(userId, roomId);
    if (
      !room ||
      !room.is_member ||
      room.role === "viewer" ||
      !room.items.some((item) => item.id === itemId)
    ) {
      return null;
    }

    const { data, error } = await this.client
      .from("deal_room_comments")
      .insert({ item_id: itemId, user_id: userId, body: body.trim() })
      .select(DEAL_ROOM_COMMENT_COLUMNS)
      .single<RawApiDealRoomComment>();
    if (error) throw error;

    await this.recordDealRoomActivity(userId, roomId, itemId, "comment_added", {});
    return (await this.attachDealRoomCommentAuthors([data]))[0] ?? null;
  }

  async deleteDealRoomComment(userId: string, roomId: string, commentId: string): Promise<boolean> {
    const room = await this.getDealRoom(userId, roomId);
    if (!room) return false;

    const { data: comment, error: commentError } = await this.client
      .from("deal_room_comments")
      .select("id,item_id,user_id")
      .eq("id", commentId)
      .maybeSingle<{ id: string; item_id: string; user_id: string }>();
    if (commentError) throw commentError;
    if (!comment || !room.items.some((item) => item.id === comment.item_id)) return false;
    if (room.role === "viewer") return false;
    if (comment.user_id !== userId && room.role !== "owner") return false;

    const { data, error } = await this.client
      .from("deal_room_comments")
      .delete()
      .eq("id", commentId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return Boolean(data);
  }

  async setDealRoomItemVote(
    userId: string,
    roomId: string,
    itemId: string,
    prefer: boolean,
  ): Promise<boolean> {
    const room = await this.getDealRoom(userId, roomId);
    if (
      !room?.is_member ||
      room.role === "viewer" ||
      !room.items.some((item) => item.id === itemId)
    ) {
      return false;
    }

    if (prefer) {
      const { error } = await this.client
        .from("deal_room_item_votes")
        .upsert(
          { item_id: itemId, user_id: userId, preference: "prefer" },
          { onConflict: "item_id,user_id" },
        );
      if (error) throw error;
    } else {
      const { error } = await this.client
        .from("deal_room_item_votes")
        .delete()
        .eq("item_id", itemId)
        .eq("user_id", userId);
      if (error) throw error;
    }

    await this.recordDealRoomActivity(userId, roomId, itemId, "vote_cast", { prefer });
    return true;
  }

  async getDealRoomActivity(userId: string, roomId: string): Promise<RawApiDealRoomActivity[]> {
    const room = await this.getDealRoom(userId, roomId);
    if (!room?.is_member) return [];

    const { data, error } = await this.client
      .from("deal_room_activity")
      .select(DEAL_ROOM_ACTIVITY_COLUMNS)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30)
      .returns<RawApiDealRoomActivity[]>();
    if (error) throw error;

    return this.attachDealRoomActivityActors(data ?? []);
  }

  async getSourcingLists(
    userId: string,
    workspaceId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<RawApiSourcingList>> {
    if (!(await this.getWorkspace(userId, workspaceId))) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    let query = this.client
      .from("sourcing_lists")
      .select(SOURCING_LIST_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query.returns<Omit<RawApiSourcingList, "products">[]>();
    if (error) {
      throw error;
    }

    const page = toPage(data ?? [], limit, (item) => item.updated_at);
    const items = await Promise.all(
      page.items.map((list) => this.getSourcingListForWorkspace(workspaceId, list.id, list)),
    );
    return { ...page, items: items.filter((item): item is RawApiSourcingList => item !== null) };
  }

  async getSourcingList(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<RawApiSourcingList | null> {
    if (!(await this.getWorkspace(userId, workspaceId))) {
      return null;
    }

    const { data, error } = await this.client
      .from("sourcing_lists")
      .select(SOURCING_LIST_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("id", sourcingListId)
      .maybeSingle<Omit<RawApiSourcingList, "products">>();
    if (error) {
      throw error;
    }

    return data ? this.getSourcingListForWorkspace(workspaceId, sourcingListId, data) : null;
  }

  async getSourcingSummary(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<ApiSourcingSummary | null> {
    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!list) return null;

    const productIds = list.products.map((product) => product.id);
    if (productIds.length === 0) {
      return buildSourcingSummary(list, [], new Map());
    }

    const { data: shortlists, error: shortlistError } = await this.client
      .from("workspace_comparison_shortlists")
      .select(COMPARISON_SHORTLIST_COLUMNS)
      .eq("workspace_id", workspaceId)
      .in("sourcing_list_product_id", productIds)
      .order("created_at", { ascending: false })
      .returns<RawApiComparisonShortlist[]>();
    if (shortlistError) throw shortlistError;

    const supplierIds = [
      ...new Set(
        (shortlists ?? [])
          .map((shortlist) => shortlist.supplier_id)
          .filter((supplierId): supplierId is string => Boolean(supplierId)),
      ),
    ];
    const supplierNames = new Map<string, string>();
    if (supplierIds.length > 0) {
      const { data: suppliers, error: supplierError } = await this.client
        .from("workspace_suppliers")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .in("id", supplierIds)
        .returns<Array<{ id: string; name: string }>>();
      if (supplierError) throw supplierError;
      for (const supplier of suppliers ?? []) supplierNames.set(supplier.id, supplier.name);
    }

    return buildSourcingSummary(list, shortlists ?? [], supplierNames);
  }

  async createSourcingList(
    userId: string,
    workspaceId: string,
    input: ApiSourcingListInput,
  ): Promise<RawApiSourcingList | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }

    const { data: list, error: listError } = await this.client
      .from("sourcing_lists")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: input.name,
        status: input.status ?? "active",
        target_budget: input.targetBudget ?? null,
        target_budget_currency:
          input.targetBudget === null || input.targetBudget === undefined
            ? null
            : (input.targetBudgetCurrency ?? workspace.default_currency),
      })
      .select(SOURCING_LIST_COLUMNS)
      .single<Omit<RawApiSourcingList, "products">>();
    if (listError) {
      throw listError;
    }

    await this.insertSourcingListProducts(workspace.default_currency, list.id, input.products);
    return this.getSourcingListForWorkspace(workspaceId, list.id, list);
  }

  async updateSourcingList(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListUpdateInput,
  ): Promise<RawApiSourcingList | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }

    const update = toSourcingListRow(workspace.default_currency, input);
    const { data: list, error } = await this.client
      .from("sourcing_lists")
      .update(update)
      .eq("workspace_id", workspaceId)
      .eq("id", sourcingListId)
      .select(SOURCING_LIST_COLUMNS)
      .maybeSingle<Omit<RawApiSourcingList, "products">>();
    if (error) {
      throw error;
    }

    return list ? this.getSourcingListForWorkspace(workspaceId, list.id, list) : null;
  }

  async duplicateSourcingList(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    name?: string,
  ): Promise<RawApiSourcingList | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }

    const source = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!source) {
      return null;
    }

    const { data: list, error: listError } = await this.client
      .from("sourcing_lists")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: name ?? `${source.name} copy`,
        status: "active",
        target_budget: source.target_budget,
        target_budget_currency: source.target_budget_currency,
      })
      .select(SOURCING_LIST_COLUMNS)
      .single<Omit<RawApiSourcingList, "products">>();
    if (listError) {
      throw listError;
    }

    await this.insertSourcingListProducts(
      workspace.default_currency,
      list.id,
      source.products.map((product) => ({
        category: product.category,
        productName: product.product_name,
        sku: product.sku,
        upc: product.upc,
        gtin: product.gtin,
        mpn: product.mpn,
        keywords: product.keywords,
        targetQuantity: product.target_quantity,
        sourcedQuantity: 0,
        targetUnitCost: toNullableNumber(product.target_unit_cost),
        targetUnitCostCurrency: product.target_unit_cost_currency,
        maxUnitCost: product.max_unit_cost === null ? null : Number(product.max_unit_cost),
        maxUnitCostCurrency: product.max_unit_cost_currency,
        estimatedShippingCost: toNullableNumber(product.estimated_shipping_cost),
        estimatedShippingCurrency: product.estimated_shipping_currency,
        estimatedDutiesTaxes: toNullableNumber(product.estimated_duties_taxes),
        estimatedDutiesTaxesCurrency: product.estimated_duties_taxes_currency,
        otherSourcingCost: toNullableNumber(product.other_sourcing_cost),
        otherSourcingCostCurrency: product.other_sourcing_cost_currency,
        desiredRetailPrice: toNullableNumber(product.desired_retail_price),
        desiredRetailPriceCurrency: product.desired_retail_price_currency,
        minimumDesiredMarginPercent: toNullableNumber(product.minimum_desired_margin_percent),
        desiredRoiPercent: toNullableNumber(product.desired_roi_percent),
        estimatedResaleFees: toNullableNumber(product.estimated_resale_fees),
        estimatedResaleFeesCurrency: product.estimated_resale_fees_currency,
        maxLandedUnitCost: toNullableNumber(product.max_landed_unit_cost),
        maxLandedUnitCostCurrency: product.max_landed_unit_cost_currency,
        alertCostBasis: product.alert_cost_basis,
        alertEnabled: product.alert_enabled,
        alertTargetPriceReached: product.alert_target_price_reached,
        alertNewCheaperSource: product.alert_new_cheaper_source,
        alertPriceDropped: product.alert_price_dropped,
        alertQuantityAvailable: product.alert_quantity_available,
        alertBackInStock: product.alert_back_in_stock,
        alertCooldownMinutes: product.alert_cooldown_minutes,
        preferredCondition: product.preferred_condition,
        marketplaceIds:
          product.sourcing_list_product_marketplaces?.map((item) => item.marketplace_id) ?? [],
        notes: product.notes,
        requiredBy: product.required_by,
      })),
    );

    return this.getSourcingListForWorkspace(workspaceId, list.id, list);
  }

  async importSourcingListProducts(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListImportInput,
  ) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }

    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!list) {
      return null;
    }

    const { data, error } = await this.client
      .rpc("import_sourcing_list_products", {
        target_user_id: userId,
        target_sourcing_list_id: sourcingListId,
        target_file_fingerprint: input.fileFingerprint,
        target_products: input.products,
      })
      .returns<
        Array<{
          imported_count: number;
          duplicate_import: boolean;
        }>
      >();
    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const refreshedList = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!isSourcingListImportRpcRow(result) || !refreshedList) {
      return null;
    }

    return {
      list: refreshedList,
      imported_count: Number(result.imported_count),
      duplicate_import: result.duplicate_import,
    };
  }

  async addSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListProductInput,
  ): Promise<RawApiSourcingList | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }
    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!list) {
      return null;
    }

    await this.insertSourcingListProducts(workspace.default_currency, sourcingListId, [input]);
    return this.getSourcingList(userId, workspaceId, sourcingListId);
  }

  async updateSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
    input: ApiSourcingListProductUpdateInput,
  ): Promise<RawApiSourcingList | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return null;
    }

    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    const existing = list?.products.find((product) => product.id === productId);
    if (!list || !existing) {
      return null;
    }

    const update = toSourcingProductRow(workspace.default_currency, input);
    const { error } = await this.client
      .from("sourcing_list_products")
      .update(update)
      .eq("id", productId)
      .eq("sourcing_list_id", sourcingListId);
    if (error) {
      throw error;
    }

    if (input.marketplaceIds !== undefined) {
      await this.replaceSourcingListProductMarketplaces(productId, input.marketplaceIds);
    }

    if (input.assignedTo !== undefined && input.assignedTo !== existing.assigned_to) {
      await this.recordSourcingActivity(userId, workspaceId, {
        sourcingListId,
        sourcingListProductId: productId,
        eventType: "assignment_changed",
        metadata: { assignedTo: input.assignedTo },
      });
    }
    if (input.workflowStatus !== undefined && input.workflowStatus !== existing.workflow_status) {
      await this.recordSourcingActivity(userId, workspaceId, {
        sourcingListId,
        sourcingListProductId: productId,
        eventType: input.workflowStatus === "completed" ? "item_completed" : "status_changed",
        metadata: { from: existing.workflow_status, to: input.workflowStatus },
      });
    }
    return this.getSourcingList(userId, workspaceId, sourcingListId);
  }

  async getSourcingNotes(
    userId: string,
    workspaceId: string,
    sourcingListProductId: string,
    comparisonShortlistId?: string,
  ): Promise<RawApiSourcingNote[] | null> {
    if (!(await this.getWorkspace(userId, workspaceId))) return null;

    let query = this.client
      .from("workspace_sourcing_notes")
      .select(
        "id,workspace_id,sourcing_list_product_id,comparison_shortlist_id,author_id,body,created_at,updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    query = comparisonShortlistId
      ? query.eq("comparison_shortlist_id", comparisonShortlistId)
      : query.eq("sourcing_list_product_id", sourcingListProductId);
    const { data, error } = await query.returns<RawApiSourcingNote[]>();
    if (error) throw error;
    return this.hydrateNotes(data ?? []);
  }

  async createSourcingNote(
    userId: string,
    workspaceId: string,
    input: {
      sourcingListProductId?: string | null;
      comparisonShortlistId?: string | null;
      body: string;
    },
  ): Promise<RawApiSourcingNote | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return null;

    const { data, error } = await this.client
      .from("workspace_sourcing_notes")
      .insert({
        workspace_id: workspaceId,
        sourcing_list_product_id: input.sourcingListProductId ?? null,
        comparison_shortlist_id: input.comparisonShortlistId ?? null,
        author_id: userId,
        body: input.body,
      })
      .select(
        "id,workspace_id,sourcing_list_product_id,comparison_shortlist_id,author_id,body,created_at,updated_at",
      )
      .single<RawApiSourcingNote>();
    if (error) throw error;

    await this.recordSourcingActivity(userId, workspaceId, {
      sourcingListProductId: input.sourcingListProductId ?? undefined,
      eventType: "note_added",
      metadata: { comparisonShortlistId: input.comparisonShortlistId ?? null },
    });
    return (await this.hydrateNotes([data]))[0] ?? null;
  }

  async getSourcingActivity(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<RawApiSourcingActivity[] | null> {
    if (!(await this.getWorkspace(userId, workspaceId))) return null;
    const { data, error } = await this.client
      .from("workspace_sourcing_activity")
      .select(
        "id,workspace_id,actor_id,sourcing_list_id,sourcing_list_product_id,event_type,metadata,created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("sourcing_list_id", sourcingListId)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<RawApiSourcingActivity[]>();
    if (error) throw error;
    return this.hydrateActivity(data ?? []);
  }

  async deleteSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
  ): Promise<boolean> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) {
      return false;
    }

    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    if (!list?.products.some((product) => product.id === productId)) {
      return false;
    }

    const { error, count } = await this.client
      .from("sourcing_list_products")
      .delete({ count: "exact" })
      .eq("id", productId)
      .eq("sourcing_list_id", sourcingListId);
    if (error) {
      throw error;
    }
    return (count ?? 0) > 0;
  }

  async getSourcingProductPriceHistory(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    sourcingListProductId: string,
  ): Promise<ApiSourcingPriceHistory | null> {
    const list = await this.getSourcingList(userId, workspaceId, sourcingListId);
    const product = list?.products.find((item) => item.id === sourcingListProductId);
    if (!list || !product) {
      return null;
    }

    const { data, error } = await this.client
      .from("sourcing_product_price_observations")
      .select(
        "id,workspace_id,sourcing_list_product_id,listing_id,marketplace_id,external_id,title,seller_name,url,observed_at,observed_price,currency,available_quantity,shipping_cost,shipping_currency,landed_unit_cost,landed_unit_cost_currency,availability",
      )
      .eq("workspace_id", workspaceId)
      .eq("sourcing_list_product_id", sourcingListProductId)
      .order("observed_at", { ascending: false })
      .limit(100)
      .returns<RawApiSourcingPriceObservation[]>();
    if (error) {
      throw error;
    }

    return summarizeSourcingPriceHistory(product, data ?? []);
  }

  async getSuppliers(
    userId: string,
    workspaceId: string,
    filters: ApiSupplierFilters = {},
  ): Promise<RawApiSupplier[]> {
    if (!(await this.getWorkspace(userId, workspaceId))) {
      return [];
    }

    let query = this.client
      .from("workspace_suppliers")
      .select(SUPPLIER_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });
    if (filters.query) {
      query = query.ilike("name", `%${filters.query}%`);
    }
    if (filters.marketplace) {
      query = query.eq("marketplace_id", filters.marketplace);
    }
    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const [suppliersResult, historyResult] = await Promise.all([
      query.returns<Omit<RawApiSupplier, "shortlisted_count">[]>(),
      this.client
        .from("workspace_supplier_shortlist_history")
        .select("supplier_id")
        .eq("workspace_id", workspaceId)
        .returns<Array<{ supplier_id: string }>>(),
    ]);
    if (suppliersResult.error) throw suppliersResult.error;
    if (historyResult.error) throw historyResult.error;

    const shortlistedCounts = new Map<string, number>();
    for (const item of historyResult.data ?? []) {
      shortlistedCounts.set(item.supplier_id, (shortlistedCounts.get(item.supplier_id) ?? 0) + 1);
    }

    return (suppliersResult.data ?? []).map((supplier) => ({
      ...supplier,
      shortlisted_count: shortlistedCounts.get(supplier.id) ?? 0,
    }));
  }

  async createSupplier(
    userId: string,
    workspaceId: string,
    input: ApiSupplierInput,
  ): Promise<RawApiSupplier | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return null;

    if (input.marketplaceSellerId) {
      const { data: existing, error: existingError } = await this.client
        .from("workspace_suppliers")
        .select(SUPPLIER_COLUMNS)
        .eq("workspace_id", workspaceId)
        .eq("marketplace_id", input.marketplace)
        .eq("marketplace_seller_id", input.marketplaceSellerId)
        .maybeSingle<Omit<RawApiSupplier, "shortlisted_count">>();
      if (existingError) throw existingError;
      if (existing) {
        const suppliers = await this.getSuppliers(userId, workspaceId, {
          marketplace: input.marketplace,
          query: existing.name,
        });
        return suppliers.find((supplier) => supplier.id === existing.id) ?? null;
      }
    }

    const { data, error } = await this.client
      .from("workspace_suppliers")
      .insert({
        workspace_id: workspaceId,
        ...toSupplierRow(input),
        created_by: userId,
      })
      .select(SUPPLIER_COLUMNS)
      .single<Omit<RawApiSupplier, "shortlisted_count">>();
    if (error) throw error;

    const suppliers = await this.getSuppliers(userId, workspaceId, { query: data.name });
    return suppliers.find((supplier) => supplier.id === data.id) ?? null;
  }

  async updateSupplier(
    userId: string,
    workspaceId: string,
    supplierId: string,
    input: ApiSupplierUpdateInput,
  ): Promise<RawApiSupplier | null> {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return null;

    const { data, error } = await this.client
      .from("workspace_suppliers")
      .update(toSupplierRow(input))
      .eq("workspace_id", workspaceId)
      .eq("id", supplierId)
      .select(SUPPLIER_COLUMNS)
      .maybeSingle<Omit<RawApiSupplier, "shortlisted_count">>();
    if (error) throw error;
    if (!data) return null;

    const suppliers = await this.getSuppliers(userId, workspaceId, { query: data.name });
    return suppliers.find((supplier) => supplier.id === data.id) ?? null;
  }

  async deleteSupplier(userId: string, workspaceId: string, supplierId: string) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return false;

    const { data, error } = await this.client
      .from("workspace_suppliers")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", supplierId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return Boolean(data);
  }

  async getSupplierShortlistHistory(
    userId: string,
    workspaceId: string,
    supplierId: string,
  ): Promise<RawApiSupplierShortlistHistory[] | null> {
    if (!(await this.getWorkspace(userId, workspaceId))) return null;

    const { data: supplier, error: supplierError } = await this.client
      .from("workspace_suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("workspace_id", workspaceId)
      .maybeSingle<{ id: string }>();
    if (supplierError) throw supplierError;
    if (!supplier) return null;

    const { data, error } = await this.client
      .from("workspace_supplier_shortlist_history")
      .select(SUPPLIER_HISTORY_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("supplier_id", supplierId)
      .order("last_shortlisted_at", { ascending: false })
      .returns<RawApiSupplierShortlistHistory[]>();
    if (error) throw error;
    return data ?? [];
  }

  async getComparisonState(userId: string, workspaceId: string, sourcingListProductId: string) {
    if (!(await this.getWorkspace(userId, workspaceId))) {
      return null;
    }

    const product = await this.getSourcingListProductWorkspace(workspaceId, sourcingListProductId);
    if (!product) {
      return null;
    }

    const [shortlistsResult, groupsResult] = await Promise.all([
      this.client
        .from("workspace_comparison_shortlists")
        .select(COMPARISON_SHORTLIST_COLUMNS)
        .eq("workspace_id", workspaceId)
        .eq("sourcing_list_product_id", sourcingListProductId)
        .order("created_at", { ascending: false })
        .returns<RawApiComparisonShortlist[]>(),
      this.client
        .from("workspace_comparison_manual_groups")
        .select(COMPARISON_GROUP_COLUMNS)
        .eq("workspace_id", workspaceId)
        .eq("sourcing_list_product_id", sourcingListProductId)
        .order("updated_at", { ascending: false })
        .returns<RawApiComparisonManualGroup[]>(),
    ]);

    if (shortlistsResult.error) throw shortlistsResult.error;
    if (groupsResult.error) throw groupsResult.error;

    return {
      shortlists: shortlistsResult.data ?? [],
      manualGroups: groupsResult.data ?? [],
    };
  }

  async upsertComparisonShortlist(
    userId: string,
    workspaceId: string,
    input: ApiComparisonShortlistInput,
  ) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return null;

    if (!(await this.getSourcingListProductWorkspace(workspaceId, input.sourcingListProductId))) {
      return null;
    }

    const supplierId = await this.resolveSupplierIdForOffer(userId, workspaceId, input);
    if (input.supplierId && !supplierId) {
      return null;
    }
    const offerSnapshot = { ...input.offer, savedSupplier: null };

    const { data, error } = await this.client
      .from("workspace_comparison_shortlists")
      .upsert(
        {
          workspace_id: workspaceId,
          sourcing_list_product_id: input.sourcingListProductId,
          marketplace_id: input.offer.source,
          external_id: input.offer.externalId,
          listing_id: input.offer.listingId,
          supplier_id: supplierId,
          offer_snapshot: offerSnapshot,
          created_by: userId,
        },
        { onConflict: "workspace_id,sourcing_list_product_id,marketplace_id,external_id" },
      )
      .select(COMPARISON_SHORTLIST_COLUMNS)
      .single<RawApiComparisonShortlist>();
    if (error) throw error;

    if (supplierId) {
      const { error: historyError } = await this.client
        .from("workspace_supplier_shortlist_history")
        .upsert(
          {
            workspace_id: workspaceId,
            supplier_id: supplierId,
            sourcing_list_product_id: input.sourcingListProductId,
            marketplace_id: input.offer.source,
            external_id: input.offer.externalId,
            listing_id: input.offer.listingId,
            offer_snapshot: offerSnapshot,
            last_shortlisted_at: new Date().toISOString(),
            last_shortlisted_by: userId,
          },
          {
            onConflict:
              "workspace_id,supplier_id,sourcing_list_product_id,marketplace_id,external_id",
          },
        );
      if (historyError) throw historyError;
    }

    await this.recordSourcingActivity(userId, workspaceId, {
      sourcingListProductId: input.sourcingListProductId,
      eventType: "offer_shortlisted",
      metadata: {
        source: input.offer.source,
        externalId: input.offer.externalId,
        shortlistId: data.id,
      },
    });

    return data;
  }

  private async resolveSupplierIdForOffer(
    userId: string,
    workspaceId: string,
    input: ApiComparisonShortlistInput,
  ) {
    const suppliers = await this.getSuppliers(userId, workspaceId, {
      marketplace: input.offer.source,
    });
    if (input.supplierId) {
      return suppliers.some((supplier) => supplier.id === input.supplierId)
        ? input.supplierId
        : null;
    }

    const normalizedSellerName = normalizeSupplierName(input.offer.sellerName);
    return (
      suppliers.find(
        (supplier) =>
          (input.offer.sellerId && supplier.marketplace_seller_id === input.offer.sellerId) ||
          (normalizedSellerName !== null &&
            normalizeSupplierName(supplier.name) === normalizedSellerName &&
            supplier.marketplace_seller_id === null),
      )?.id ?? null
    );
  }

  async deleteComparisonShortlist(userId: string, workspaceId: string, shortlistId: string) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return false;

    const { data, error } = await this.client
      .from("workspace_comparison_shortlists")
      .delete()
      .eq("id", shortlistId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return Boolean(data);
  }

  async createComparisonManualGroup(
    userId: string,
    workspaceId: string,
    input: ApiComparisonManualGroupInput,
  ) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return null;

    if (!(await this.getSourcingListProductWorkspace(workspaceId, input.sourcingListProductId))) {
      return null;
    }

    const { data, error } = await this.client
      .from("workspace_comparison_manual_groups")
      .insert({
        workspace_id: workspaceId,
        sourcing_list_product_id: input.sourcingListProductId,
        member_refs: input.members,
        created_by: userId,
      })
      .select(COMPARISON_GROUP_COLUMNS)
      .single<RawApiComparisonManualGroup>();
    if (error) throw error;
    return data;
  }

  async deleteComparisonManualGroup(userId: string, workspaceId: string, groupId: string) {
    const workspace = await this.getWorkspace(userId, workspaceId);
    if (!workspace || !isWorkspaceEditor(workspace.role)) return false;

    const { data, error } = await this.client
      .from("workspace_comparison_manual_groups")
      .delete()
      .eq("id", groupId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return Boolean(data);
  }

  private async recordSourcingActivity(
    actorId: string,
    workspaceId: string,
    input: {
      sourcingListId?: string;
      sourcingListProductId?: string;
      eventType: RawApiSourcingActivity["event_type"];
      metadata: Record<string, unknown>;
    },
  ) {
    const { error } = await this.client.from("workspace_sourcing_activity").insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      sourcing_list_id: input.sourcingListId ?? null,
      sourcing_list_product_id: input.sourcingListProductId ?? null,
      event_type: input.eventType,
      metadata: input.metadata,
    });
    if (error) throw error;
  }

  private async hydrateNotes(notes: RawApiSourcingNote[]) {
    const authorIds = [...new Set(notes.map((note) => note.author_id))];
    if (authorIds.length === 0) return notes;
    const { data, error } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", authorIds)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (error) throw error;
    const profiles = new Map((data ?? []).map((profile) => [profile.id, profile]));
    return notes.map((note) => ({ ...note, author: profiles.get(note.author_id) ?? null }));
  }

  private async hydrateActivity(activity: RawApiSourcingActivity[]) {
    const actorIds = [...new Set(activity.map((item) => item.actor_id))];
    if (actorIds.length === 0) return activity;
    const { data, error } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", actorIds)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (error) throw error;
    const profiles = new Map((data ?? []).map((profile) => [profile.id, profile]));
    return activity.map((item) => ({ ...item, actor: profiles.get(item.actor_id) ?? null }));
  }

  private async getSourcingListProductWorkspace(workspaceId: string, productId: string) {
    const { data, error } = await this.client
      .from("sourcing_list_products")
      .select("id,sourcing_lists!inner(workspace_id)")
      .eq("id", productId)
      .eq("sourcing_lists.workspace_id", workspaceId)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return data;
  }

  private async insertSourcingListProducts(
    defaultCurrency: string,
    sourcingListId: string,
    products: ApiSourcingListProductInput[],
  ) {
    const rows = products.map((product, index) => ({
      sourcing_list_id: sourcingListId,
      ...toSourcingProductRow(defaultCurrency, product),
      sort_order: index,
    }));
    const { data, error } = await this.client
      .from("sourcing_list_products")
      .insert(rows)
      .select(SOURCING_LIST_PRODUCT_COLUMNS)
      .returns<RawApiSourcingList["products"]>();
    if (error) {
      throw error;
    }

    for (const [index, product] of products.entries()) {
      const inserted = data?.[index];
      if (inserted) {
        await this.replaceSourcingListProductMarketplaces(inserted.id, product.marketplaceIds);
      }
    }
  }

  private async replaceSourcingListProductMarketplaces(
    productId: string,
    marketplaceIds: string[],
  ) {
    const { error: deleteError } = await this.client
      .from("sourcing_list_product_marketplaces")
      .delete()
      .eq("sourcing_list_product_id", productId);
    if (deleteError) {
      throw deleteError;
    }
    const { error: insertError } = await this.client
      .from("sourcing_list_product_marketplaces")
      .insert(
        marketplaceIds.map((marketplaceId) => ({
          sourcing_list_product_id: productId,
          marketplace_id: marketplaceId,
        })),
      );
    if (insertError) {
      throw insertError;
    }
  }

  private async getSourcingListForWorkspace(
    workspaceId: string,
    sourcingListId: string,
    list: Omit<RawApiSourcingList, "products">,
  ): Promise<RawApiSourcingList | null> {
    const { data: products, error } = await this.client
      .from("sourcing_list_products")
      .select(SOURCING_LIST_PRODUCT_COLUMNS)
      .eq("sourcing_list_id", sourcingListId)
      .order("sort_order", { ascending: true })
      .returns<RawApiSourcingList["products"]>();
    if (error) {
      throw error;
    }

    return list.workspace_id === workspaceId ? { ...list, products: products ?? [] } : null;
  }

  persistListings(listings: MarketplaceListing[]) {
    return this.listingRepository.upsertListings(listings);
  }

  async getListingForUser(userId: string, listingId: string): Promise<StoredListingAccess | null> {
    const { data: listing, error: listingError } = await this.client
      .from("listings")
      .select(LISTING_COLUMNS)
      .eq("id", listingId)
      .eq("is_active", true)
      .maybeSingle<RawApiListing>();

    if (listingError) {
      throw listingError;
    }

    if (!listing) {
      return null;
    }

    const [
      { data: matches, error: matchError },
      { data: favorites, error: favoriteError },
      { data: observations, error: observationError },
    ] = await Promise.all([
      this.client
        .from("matches")
        .select("matched_at,watchlist:watchlists!inner(filters)")
        .eq("user_id", userId)
        .eq("watchlist.user_id", userId)
        .eq("listing_id", listingId)
        .neq("status", "dismissed")
        .order("matched_at", { ascending: false })
        .limit(1)
        .returns<StoredListingMatch[]>(),
      this.client
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("listing_id", listingId)
        .limit(1)
        .returns<Array<{ id: string }>>(),
      this.client
        .from("listing_price_observations")
        .select("price,currency,observed_at")
        .eq("listing_id", listingId)
        .order("observed_at", { ascending: true })
        .returns<StoredPriceObservation[]>(),
    ]);

    if (matchError) {
      throw matchError;
    }

    if (favoriteError) {
      throw favoriteError;
    }

    if (observationError) {
      throw observationError;
    }

    const latestMatch = matches?.[0];
    const watchlist = unwrap(latestMatch?.watchlist ?? null);
    let priceHistory: PriceHistorySummary;
    if (listing.product_identity_id && listing.product_variant_id) {
      const { data: productObservations, error: productObservationError } = await this.client
        .from("product_price_observations")
        .select(
          "price,currency,observed_at,marketplace_id,shipping_price,shipping_currency,condition",
        )
        .eq("product_identity_id", listing.product_identity_id)
        .eq("product_variant_id", listing.product_variant_id)
        .order("observed_at", { ascending: false })
        .returns<StoredProductPriceObservation[]>();

      if (productObservationError) {
        throw productObservationError;
      }

      priceHistory =
        productObservations && productObservations.length > 0
          ? summarizeProductPriceHistory(
              productObservations
                .map((observation) => ({
                  price: Number(observation.price),
                  currency: observation.currency,
                  observedAt: observation.observed_at,
                  marketplace: observation.marketplace_id,
                  shippingPrice:
                    observation.shipping_price === null ? null : Number(observation.shipping_price),
                  shippingCurrency: observation.shipping_currency,
                  condition: observation.condition,
                }))
                .filter((observation) => Number.isFinite(observation.price)),
            )
          : summarizeLegacyListingPriceHistory(listing, observations ?? []);
    } else {
      priceHistory = summarizeLegacyListingPriceHistory(listing, observations ?? []);
    }

    return {
      listing,
      matchedAt: latestMatch?.matched_at ?? null,
      isFavorite: Boolean(favorites?.length),
      priceHistory,
      priceTarget: toPriceTarget(listing, watchlist?.filters.price),
    };
  }

  async setListingFavorite(userId: string, listingId: string, isFavorite: boolean) {
    const accessible = await this.getListingForUser(userId, listingId);
    if (!accessible) {
      return false;
    }

    if (isFavorite) {
      const { error } = await this.client
        .from("favorites")
        .upsert(
          { user_id: userId, listing_id: listingId },
          { onConflict: "user_id,listing_id", ignoreDuplicates: true },
        );
      if (error) {
        throw error;
      }

      return true;
    }

    const { error } = await this.client
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) {
      throw error;
    }

    return true;
  }

  async recordProductEvent(userId: string, input: ProductEventInput) {
    const { error } = await this.client.from("product_events").upsert(
      {
        user_id: userId,
        event_name: input.eventName,
        event_key: input.eventKey,
        properties: input.properties,
      },
      { onConflict: "user_id,event_name,event_key", ignoreDuplicates: true },
    );
    if (error) {
      throw error;
    }
  }

  async createProductCapture(
    userId: string,
    input: ApiProductCaptureInput,
  ): Promise<RawApiProductCapture> {
    const { data, error } = await this.client
      .from("product_captures")
      .insert({
        user_id: userId,
        capture_source: input.captureSource,
        url: input.url ?? null,
        raw_text: input.rawText ?? null,
        barcode: input.barcode ?? null,
        barcode_format: input.barcodeFormat ?? null,
        image_reference: input.imageReference ?? null,
        country: input.country,
        preferred_currency: input.preferredCurrency,
        status: "processing",
      })
      .select(PRODUCT_CAPTURE_COLUMNS)
      .single<RawApiProductCapture>();
    if (error) {
      throw error;
    }

    return data;
  }

  async updateProductCapture(
    userId: string,
    captureId: string,
    input: ApiProductCaptureStatusUpdate,
  ): Promise<RawApiProductCapture | null> {
    const { data, error } = await this.client
      .from("product_captures")
      .update({
        status: input.status,
        normalized_product: input.normalizedProduct,
        candidate_products: input.candidateProducts,
        missing_fields: input.missingFields,
        failure_reason: input.failureReason,
        processed_at: input.processedAt,
      })
      .eq("id", captureId)
      .eq("user_id", userId)
      .select(PRODUCT_CAPTURE_COLUMNS)
      .maybeSingle<RawApiProductCapture>();
    if (error) {
      throw error;
    }

    return data;
  }

  async getProductCapture(userId: string, captureId: string): Promise<RawApiProductCapture | null> {
    const { data, error } = await this.client
      .from("product_captures")
      .select(PRODUCT_CAPTURE_COLUMNS)
      .eq("id", captureId)
      .eq("user_id", userId)
      .maybeSingle<RawApiProductCapture>();
    if (error) {
      throw error;
    }

    return data;
  }

  async createListingProblemReport(
    userId: string,
    requestId: string,
    input: ListingProblemReportInput,
  ): Promise<string | null> {
    const { data: listing, error: listingError } = await this.client
      .from("listings")
      .select("id,marketplace_id")
      .eq("id", input.listingId)
      .maybeSingle<{ id: string; marketplace_id: string }>();

    if (listingError) {
      throw listingError;
    }

    if (!listing || listing.marketplace_id !== input.marketplace) {
      return null;
    }

    let matchId: string | null = null;
    if (input.matchId) {
      const { data: match, error: matchError } = await this.client
        .from("matches")
        .select("id,watchlist_id,listing_id")
        .eq("id", input.matchId)
        .eq("user_id", userId)
        .maybeSingle<{ id: string; watchlist_id: string; listing_id: string }>();

      if (matchError) {
        throw matchError;
      }

      if (!match || match.listing_id !== input.listingId) {
        return null;
      }

      matchId = match.id;
      if (input.watchlistId && input.watchlistId !== match.watchlist_id) {
        return null;
      }
    }

    let watchlistId: string | null = input.watchlistId ?? null;
    if (watchlistId) {
      const { data: watchlist, error: watchlistError } = await this.client
        .from("watchlists")
        .select("id")
        .eq("id", watchlistId)
        .eq("user_id", userId)
        .maybeSingle<{ id: string }>();

      if (watchlistError) {
        throw watchlistError;
      }

      if (!watchlist) {
        return null;
      }
    }

    const { data: report, error: reportError } = await this.client
      .from("listing_problem_reports")
      .upsert(
        {
          user_id: userId,
          listing_id: listing.id,
          marketplace_id: listing.marketplace_id,
          category: input.category,
          match_id: matchId,
          watchlist_id: watchlistId,
          app_version: input.appVersion,
          request_id: requestId,
          idempotency_key: input.idempotencyKey,
        },
        { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle<{ id: string }>();

    if (reportError) {
      throw reportError;
    }

    if (report) {
      return report.id;
    }

    const { data: existingReport, error: existingReportError } = await this.client
      .from("listing_problem_reports")
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle<{ id: string }>();

    if (existingReportError) {
      throw existingReportError;
    }

    return existingReport?.id ?? null;
  }

  async getWatchlists(userId: string, cursor: string | null, limit: number) {
    let query = this.client
      .from("watchlists")
      .select(WATCHLIST_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query.returns<RawApiWatchlist[]>();
    if (error) {
      throw error;
    }

    return toPage(data ?? [], limit, (item) => item.updated_at);
  }

  async getWatchlist(userId: string, watchlistId: string) {
    const { data, error } = await this.client
      .from("watchlists")
      .select(WATCHLIST_COLUMNS)
      .eq("user_id", userId)
      .eq("id", watchlistId)
      .maybeSingle<RawApiWatchlist>();

    if (error) {
      throw error;
    }

    return data;
  }

  async createWatchlist(
    userId: string,
    input: Parameters<MobileApiRepositoryContract["createWatchlist"]>[1],
  ) {
    const { data, error } = await this.client
      .from("watchlists")
      .insert({
        user_id: userId,
        marketplace_id: input.marketplaceIds[0],
        marketplace_scope: input.marketplaceScope,
        alert_mode: input.alertMode,
        name: input.name,
        search_query: input.searchQuery,
        filters: input.filters,
        is_active: input.isActive,
        is_favorite: input.isFavorite,
        lifecycle_state: input.isActive ? "active" : "paused",
      })
      .select("id")
      .single<{ id: string }>();

    if (error) {
      throw error;
    }

    await this.setMarketplaceSelection(data.id, input.marketplaceScope, input.marketplaceIds);
    const watchlist = await this.getWatchlist(userId, data.id);
    if (!watchlist) {
      throw new Error("Created watchlist could not be loaded.");
    }

    return watchlist;
  }

  async updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Parameters<MobileApiRepositoryContract["updateWatchlist"]>[2],
  ) {
    const current = await this.getWatchlist(userId, watchlistId);
    if (!current) {
      return null;
    }

    const values: Record<string, unknown> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.searchQuery !== undefined) values.search_query = input.searchQuery;
    if (input.filters !== undefined) values.filters = input.filters;
    if (input.isActive !== undefined) values.is_active = input.isActive;
    if (input.isFavorite !== undefined) values.is_favorite = input.isFavorite;
    if (input.alertMode !== undefined) values.alert_mode = input.alertMode;
    if (input.marketplaceScope !== undefined) values.marketplace_scope = input.marketplaceScope;
    if (input.marketplaceIds !== undefined) values.marketplace_id = input.marketplaceIds[0];
    if (input.lifecycleState !== undefined) {
      values.lifecycle_state = input.lifecycleState;
      values.is_active = input.lifecycleState === "active" || input.lifecycleState === "snoozed";
      values.snoozed_until = input.lifecycleState === "snoozed" ? input.snoozedUntil : null;
      values.completed_at =
        input.lifecycleState === "completed"
          ? (input.completedAt ?? new Date().toISOString())
          : null;
    } else if (input.isActive !== undefined) {
      values.lifecycle_state = input.isActive ? "active" : "paused";
      values.snoozed_until = null;
      values.completed_at = null;
    }

    if (input.snoozedUntil !== undefined && input.lifecycleState === "snoozed") {
      values.snoozed_until = input.snoozedUntil;
    }
    if (input.completedAt !== undefined && input.lifecycleState === "completed") {
      values.completed_at = input.completedAt;
    }

    if (Object.keys(values).length > 0) {
      const { error } = await this.client
        .from("watchlists")
        .update(values)
        .eq("id", watchlistId)
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
    }

    if (input.marketplaceScope !== undefined || input.marketplaceIds !== undefined) {
      await this.setMarketplaceSelection(
        watchlistId,
        input.marketplaceScope ?? current.marketplace_scope,
        input.marketplaceIds ??
          current.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [
            current.marketplace_id,
          ],
      );
    }

    return this.getWatchlist(userId, watchlistId);
  }

  async deleteWatchlist(userId: string, watchlistId: string) {
    const { data, error } = await this.client
      .from("watchlists")
      .delete()
      .eq("id", watchlistId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
    includeDismissed = false,
    options: MatchQueryOptions = {},
  ) {
    let query = this.client
      .from("matches")
      .select(
        `id,watchlist_id,listing_id,status,matched_at,listing:listings!inner(${MATCH_LISTING_COLUMNS}),watchlist:watchlists!inner(id,name)`,
      )
      .eq("user_id", userId)
      .eq("watchlist.user_id", userId)
      .order("matched_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (options.status) {
      query = query.eq("status", options.status);
    } else if (!includeDismissed) {
      query = query.neq("status", "dismissed");
    }

    if (watchlistId) {
      query = query.eq("watchlist_id", watchlistId);
    }

    if (cursor) {
      query = query.lt("matched_at", cursor);
    }

    const { data, error } = await query.returns<RawApiMatch[]>();
    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const listingIds = rows.map((row) => row.listing_id);
    const favoriteIds = await this.getFavoriteIds(userId, listingIds);
    const feedbackByMatchId = await this.getFeedbackByMatchIds(
      userId,
      rows.map((row) => row.id),
    );
    const items = rows.map((row) => ({
      ...row,
      favorite: favoriteIds.has(row.listing_id),
      feedback: feedbackByMatchId.get(row.id) ?? null,
    }));
    return toPage(items, limit, (item) => item.matched_at);
  }

  async getFavoriteListings(userId: string, cursor: string | null, limit: number) {
    let query = this.client
      .from("favorites")
      .select(`created_at,listing:listings!inner(${LISTING_COLUMNS})`)
      .eq("user_id", userId)
      .eq("listing.is_active", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query.returns<
      Array<{
        created_at: string;
        listing: RawApiListing | RawApiListing[] | null;
      }>
    >();
    if (error) {
      throw error;
    }

    const items: StoredFavoriteListing[] = [];
    for (const row of data ?? []) {
      const listing = unwrap(row.listing);
      if (listing) {
        items.push({
          listing,
          matchedAt: null,
          isFavorite: true,
          savedAt: row.created_at,
        });
      }
    }

    return toPage(items, limit, (item) => item.savedAt);
  }

  async setMatchStatus(
    userId: string,
    matchId: string,
    status: NonNullable<RawApiMatch["status"]>,
  ) {
    const { data, error } = await this.client
      .from("matches")
      .update({ status })
      .eq("id", matchId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async setMatchFeedback(
    userId: string,
    matchId: string,
    feedback: NonNullable<RawApiMatch["feedback"]> | null,
  ) {
    const { data: match, error: matchError } = await this.client
      .from("matches")
      .select("id")
      .eq("id", matchId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();
    if (matchError) {
      throw matchError;
    }

    if (!match) {
      return false;
    }

    if (feedback === null) {
      const { error } = await this.client
        .from("match_feedback")
        .delete()
        .eq("match_id", matchId)
        .eq("user_id", userId);
      if (error) {
        throw error;
      }
      return true;
    }

    const { error } = await this.client
      .from("match_feedback")
      .upsert({ user_id: userId, match_id: matchId, feedback }, { onConflict: "user_id,match_id" });
    if (error) {
      throw error;
    }

    return true;
  }

  async getNotifications(userId: string, cursor: string | null, limit: number) {
    let query = this.client
      .from("notifications")
      .select("id,match_id,type,title,body,data,read_at,sent_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query.returns<RawApiNotification[]>();
    if (error) {
      throw error;
    }

    return toPage(data ?? [], limit, (item) => item.created_at);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const { data, error } = await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .is("read_at", null)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  async getNotificationPreferences(userId: string) {
    const { data, error } = await this.client
      .from("notification_preferences")
      .select(
        "push_enabled,new_match_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,daily_alert_limit,weekly_summary_enabled",
      )
      .eq("user_id", userId)
      .maybeSingle<{
        push_enabled: boolean;
        new_match_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
        daily_alert_limit: number;
        weekly_summary_enabled: boolean;
      }>();
    if (error) {
      throw error;
    }

    return {
      pushEnabled: data?.push_enabled ?? true,
      newMatchEnabled: data?.new_match_enabled ?? true,
      quietHoursEnabled: data?.quiet_hours_enabled ?? false,
      quietHoursStart: data?.quiet_hours_start ?? null,
      quietHoursEnd: data?.quiet_hours_end ?? null,
      timezone: data?.timezone ?? "UTC",
      dailyAlertLimit: data?.daily_alert_limit ?? 20,
      weeklySummaryEnabled: data?.weekly_summary_enabled ?? true,
    };
  }

  async updateNotificationPreferences(userId: string, preferences: ApiNotificationPreferences) {
    const { data, error } = await this.client
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          push_enabled: preferences.pushEnabled,
          new_match_enabled: preferences.newMatchEnabled,
          quiet_hours_enabled: preferences.quietHoursEnabled,
          quiet_hours_start: preferences.quietHoursStart,
          quiet_hours_end: preferences.quietHoursEnd,
          timezone: preferences.timezone,
          daily_alert_limit: preferences.dailyAlertLimit,
          weekly_summary_enabled: preferences.weeklySummaryEnabled,
        },
        { onConflict: "user_id" },
      )
      .select(
        "push_enabled,new_match_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,daily_alert_limit,weekly_summary_enabled",
      )
      .single<{
        push_enabled: boolean;
        new_match_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
        daily_alert_limit: number;
        weekly_summary_enabled: boolean;
      }>();
    if (error) {
      throw error;
    }

    return {
      pushEnabled: data.push_enabled,
      newMatchEnabled: data.new_match_enabled,
      quietHoursEnabled: data.quiet_hours_enabled,
      quietHoursStart: data.quiet_hours_start,
      quietHoursEnd: data.quiet_hours_end,
      timezone: data.timezone,
      dailyAlertLimit: data.daily_alert_limit,
      weeklySummaryEnabled: data.weekly_summary_enabled,
    };
  }

  async getShoppingPreferences(userId: string): Promise<RawApiShoppingPreferences> {
    const { data, error } = await this.client
      .from("profiles")
      .select(
        "country,preferred_currency,preferred_marketplaces,willing_to_buy_internationally,updated_at",
      )
      .eq("id", userId)
      .single<RawApiShoppingPreferences>();

    if (error) {
      throw error;
    }

    return data;
  }

  async updateShoppingPreferences(
    userId: string,
    preferences: ApiShoppingPreferencesInput,
  ): Promise<RawApiShoppingPreferences> {
    const { data, error } = await this.client
      .from("profiles")
      .update({
        country: preferences.country,
        preferred_currency: preferences.preferredCurrency,
        preferred_marketplaces: preferences.preferredMarketplaces,
        willing_to_buy_internationally: preferences.willingToBuyInternationally,
      })
      .eq("id", userId)
      .select(
        "country,preferred_currency,preferred_marketplaces,willing_to_buy_internationally,updated_at",
      )
      .single<RawApiShoppingPreferences>();

    if (error) {
      throw error;
    }

    return data;
  }

  async getWeeklySummary(userId: string) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodStartIso = periodStart.toISOString();
    const periodEndIso = periodEnd.toISOString();
    const preferences = await this.getNotificationPreferences(userId);

    if (!preferences.weeklySummaryEnabled) {
      return aggregateWeeklySummary({
        enabled: false,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        activeWatchlists: [],
        matches: [],
        savedListingIds: [],
        observations: [],
      });
    }

    const [matchesResult, favoritesResult, watchlistsResult] = await Promise.all([
      this.client
        .from("matches")
        .select(
          "id,watchlist_id,listing_id,status,matched_at,listing:listings!inner(price,currency)",
        )
        .eq("user_id", userId)
        .neq("status", "dismissed")
        .gte("matched_at", periodStartIso)
        .lte("matched_at", periodEndIso)
        .order("matched_at", { ascending: false })
        .returns<WeeklyMatchRow[]>(),
      this.client
        .from("favorites")
        .select("listing_id")
        .eq("user_id", userId)
        .gte("created_at", periodStartIso)
        .lte("created_at", periodEndIso)
        .returns<Array<{ listing_id: string }>>(),
      this.client
        .from("watchlists")
        .select("id,name")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("lifecycle_state", "active")
        .order("updated_at", { ascending: false })
        .returns<WeeklyWatchlistRow[]>(),
    ]);

    if (matchesResult.error) {
      throw matchesResult.error;
    }
    if (favoritesResult.error) {
      throw favoritesResult.error;
    }
    if (watchlistsResult.error) {
      throw watchlistsResult.error;
    }

    const rows = matchesResult.data ?? [];
    const listingIds = [...new Set(rows.map((row) => row.listing_id))];
    let observations: Array<{
      listing_id: string;
      observed_at: string;
      price: number;
      currency: string;
    }> = [];

    if (listingIds.length > 0) {
      const observationResult = await this.client
        .from("listing_price_observations")
        .select("listing_id,observed_at,price,currency")
        .in("listing_id", listingIds)
        .order("observed_at", { ascending: true })
        .returns<typeof observations>();
      if (observationResult.error) {
        throw observationResult.error;
      }
      observations = observationResult.data ?? [];
    }

    const matches: WeeklySummaryMatch[] = rows.map((row) => {
      const listing = unwrap(row.listing);
      return {
        id: row.id,
        watchlistId: row.watchlist_id,
        listingId: row.listing_id,
        matchedAt: row.matched_at,
        currentPrice: listing?.price ?? null,
        currentCurrency: listing?.currency ?? null,
      };
    });

    return aggregateWeeklySummary({
      enabled: true,
      periodStart: periodStartIso,
      periodEnd: periodEndIso,
      activeWatchlists: watchlistsResult.data ?? [],
      matches,
      savedListingIds: [...new Set((favoritesResult.data ?? []).map((item) => item.listing_id))],
      observations: observations.map((observation) => ({
        listingId: observation.listing_id,
        observedAt: observation.observed_at,
        price: Number(observation.price),
        currency: observation.currency,
      })),
    });
  }

  async registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ) {
    const { error } = await this.client.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: input.expoPushToken,
        platform: input.platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,expo_push_token" },
    );
    if (error) {
      throw error;
    }
  }

  private async setMarketplaceSelection(
    watchlistId: string,
    scope: "selected" | "all",
    marketplaceIds: string[],
  ) {
    const { error } = await this.client.rpc("set_watchlist_marketplace_selection", {
      p_watchlist_id: watchlistId,
      p_scope: scope,
      p_marketplace_ids: marketplaceIds,
    });
    if (error) {
      throw error;
    }
  }

  private async getDealRoomRole(
    userId: string,
    roomId: string,
    ownerId?: string,
  ): Promise<ApiDealRoomRole | null> {
    if (ownerId === userId) return "owner";

    const { data, error } = await this.client
      .from("deal_room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle<{ role: ApiDealRoomRole }>();
    if (error) throw error;

    return data?.role ?? null;
  }

  private async canContributeToDealRoom(userId: string, roomId: string) {
    const { data: room, error } = await this.client
      .from("deal_rooms")
      .select("user_id")
      .eq("id", roomId)
      .maybeSingle<{ user_id: string }>();
    if (error) throw error;
    if (!room) return false;

    const role = await this.getDealRoomRole(userId, roomId, room.user_id);
    return role === "owner" || role === "contributor";
  }

  private async canAddDealRoomReference(userId: string, input: ApiDealRoomItemInput) {
    if (input.itemType === "product") {
      if (!input.productIdentityId) {
        return false;
      }

      const { data, error } = await this.client
        .from("product_identities")
        .select("id")
        .eq("id", input.productIdentityId)
        .maybeSingle<{ id: string }>();
      if (error) {
        throw error;
      }

      return Boolean(data);
    }

    if (input.itemType === "tracked_product") {
      return Boolean(input.watchlistId && (await this.getWatchlist(userId, input.watchlistId)));
    }

    if (!input.listingId || !(await this.getListingForUser(userId, input.listingId))) {
      return false;
    }

    if (input.itemType !== "saved_product") {
      return true;
    }

    const { data, error } = await this.client
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("listing_id", input.listingId)
      .maybeSingle<{ id: string }>();
    if (error) {
      throw error;
    }

    return Boolean(data);
  }

  private async findDealRoomItem(userId: string, roomId: string, itemId: string) {
    const room = await this.getDealRoom(userId, roomId);
    return room?.items.find((item) => item.id === itemId) ?? null;
  }

  private async withDealRoomItems(
    room: Omit<RawApiDealRoom, "items">,
    viewerId: string | null = null,
  ): Promise<RawApiDealRoom> {
    return {
      ...room,
      member_count: await this.getDealRoomMemberCount(room.id),
      items: await this.getDealRoomItems(room.id, viewerId),
    };
  }

  private async getDealRoomMemberCount(roomId: string) {
    const { count, error } = await this.client
      .from("deal_room_members")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    if (error) throw error;
    return count ?? 0;
  }

  private async getDealRoomItems(
    roomId: string,
    viewerId: string | null = null,
  ): Promise<RawApiDealRoomItem[]> {
    const { data: itemRows, error: itemError } = await this.client
      .from("deal_room_items")
      .select(DEAL_ROOM_ITEM_COLUMNS)
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<RawApiDealRoomItem[]>();
    if (itemError) {
      throw itemError;
    }

    const rows = itemRows ?? [];
    if (rows.length === 0) {
      return [];
    }

    const itemIds = rows.map((row) => row.id);
    const { data: votes, error: votesError } = await this.client
      .from("deal_room_item_votes")
      .select("item_id,user_id")
      .in("item_id", itemIds)
      .returns<Array<{ item_id: string; user_id: string }>>();
    if (votesError) throw votesError;
    const votesByItem = new Map<string, Array<{ user_id: string }>>();
    for (const vote of votes ?? []) {
      const itemVotes = votesByItem.get(vote.item_id) ?? [];
      itemVotes.push(vote);
      votesByItem.set(vote.item_id, itemVotes);
    }

    const listingIds = [
      ...new Set(rows.flatMap((row) => (row.listing_id ? [row.listing_id] : []))),
    ];
    const watchlistIds = [
      ...new Set(rows.flatMap((row) => (row.watchlist_id ? [row.watchlist_id] : []))),
    ];
    const productIdentityIds = [
      ...new Set(rows.flatMap((row) => (row.product_identity_id ? [row.product_identity_id] : []))),
    ];

    let listings: RawApiListing[] = [];
    if (listingIds.length > 0) {
      const { data, error } = await this.client
        .from("listings")
        .select(LISTING_COLUMNS)
        .in("id", listingIds)
        .returns<RawApiListing[]>();
      if (error) {
        throw error;
      }
      listings = data ?? [];
    }

    let productListings: RawApiListing[] = [];
    if (productIdentityIds.length > 0) {
      const { data, error } = await this.client
        .from("listings")
        .select(LISTING_COLUMNS)
        .in("product_identity_id", productIdentityIds)
        .order("is_active", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .returns<RawApiListing[]>();
      if (error) {
        throw error;
      }
      productListings = data ?? [];
    }

    let watchlists: RawApiWatchlist[] = [];
    if (watchlistIds.length > 0) {
      const { data, error } = await this.client
        .from("watchlists")
        .select(WATCHLIST_COLUMNS)
        .in("id", watchlistIds)
        .returns<RawApiWatchlist[]>();
      if (error) {
        throw error;
      }
      watchlists = data ?? [];
    }

    let productIdentities: Array<{ id: string; canonical_title: string }> = [];
    if (productIdentityIds.length > 0) {
      const { data, error } = await this.client
        .from("product_identities")
        .select("id,canonical_title")
        .in("id", productIdentityIds)
        .returns<Array<{ id: string; canonical_title: string }>>();
      if (error) {
        throw error;
      }
      productIdentities = data ?? [];
    }

    let matchRows: Array<{
      watchlist_id: string;
      listing: RawApiListing | RawApiListing[] | null;
    }> = [];
    if (watchlistIds.length > 0) {
      const { data, error } = await this.client
        .from("matches")
        .select(`watchlist_id,listing:listings!inner(${MATCH_LISTING_COLUMNS})`)
        .in("watchlist_id", watchlistIds)
        .neq("status", "dismissed")
        .order("matched_at", { ascending: false })
        .returns<
          Array<{
            watchlist_id: string;
            listing: RawApiListing | RawApiListing[] | null;
          }>
        >();
      if (error) {
        throw error;
      }
      matchRows = data ?? [];
    }

    const listingById = new Map(
      [...listings, ...productListings].map((listing) => [listing.id, listing]),
    );
    const watchlistById = new Map(watchlists.map((watchlist) => [watchlist.id, watchlist]));
    const identityById = new Map(productIdentities.map((identity) => [identity.id, identity]));
    const productListingByIdentity = new Map<string, RawApiListing>();
    for (const listing of productListings) {
      if (
        listing.product_identity_id &&
        !productListingByIdentity.has(listing.product_identity_id)
      ) {
        productListingByIdentity.set(listing.product_identity_id, listing);
      }
    }
    const currentListingByWatchlist = new Map<string, RawApiListing>();
    for (const match of matchRows) {
      const listing = unwrap(match.listing);
      if (listing && !currentListingByWatchlist.has(match.watchlist_id)) {
        currentListingByWatchlist.set(match.watchlist_id, listing);
      }
    }

    return rows.map((row) => ({
      ...row,
      vote_count: votesByItem.get(row.id)?.length ?? 0,
      viewer_voted: Boolean(
        viewerId && votesByItem.get(row.id)?.some((vote) => vote.user_id === viewerId),
      ),
      listing: row.listing_id ? (listingById.get(row.listing_id) ?? null) : null,
      current_listing: row.watchlist_id
        ? (currentListingByWatchlist.get(row.watchlist_id) ?? null)
        : row.product_identity_id
          ? (productListingByIdentity.get(row.product_identity_id) ?? null)
          : null,
      watchlist: row.watchlist_id ? (watchlistById.get(row.watchlist_id) ?? null) : null,
      product_identity: row.product_identity_id
        ? (identityById.get(row.product_identity_id) ?? null)
        : null,
    }));
  }

  private async attachDealRoomCommentAuthors(
    comments: RawApiDealRoomComment[],
  ): Promise<RawApiDealRoomComment[]> {
    const userIds = [...new Set(comments.map((comment) => comment.user_id))];
    if (userIds.length === 0) return comments;

    const { data: profiles, error } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (error) throw error;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return comments.map((comment) => ({
      ...comment,
      author: profileById.get(comment.user_id) ?? null,
    }));
  }

  private async attachDealRoomActivityActors(
    activities: RawApiDealRoomActivity[],
  ): Promise<RawApiDealRoomActivity[]> {
    const userIds = [...new Set(activities.map((activity) => activity.actor_id))];
    if (userIds.length === 0) return activities;

    const { data: profiles, error } = await this.client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds)
      .returns<Array<{ id: string; email: string | null; full_name: string | null }>>();
    if (error) throw error;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return activities.map((activity) => ({
      ...activity,
      actor: profileById.get(activity.actor_id) ?? null,
    }));
  }

  private async recordDealRoomActivity(
    actorId: string,
    roomId: string,
    itemId: string | null,
    eventType: RawApiDealRoomActivity["event_type"],
    metadata: Record<string, unknown>,
  ) {
    const { error } = await this.client.from("deal_room_activity").insert({
      room_id: roomId,
      item_id: itemId,
      actor_id: actorId,
      event_type: eventType,
      metadata,
    });
    if (error) throw error;
  }

  private async getFavoriteIds(userId: string, listingIds: string[]) {
    if (listingIds.length === 0) {
      return new Set<string>();
    }

    const { data, error } = await this.client
      .from("favorites")
      .select("listing_id")
      .eq("user_id", userId)
      .in("listing_id", listingIds)
      .returns<Array<{ listing_id: string }>>();
    if (error) {
      throw error;
    }

    return new Set((data ?? []).map((favorite) => favorite.listing_id));
  }

  private async getFeedbackByMatchIds(userId: string, matchIds: string[]) {
    if (matchIds.length === 0) {
      return new Map<string, NonNullable<RawApiMatch["feedback"]>>();
    }

    const { data, error } = await this.client
      .from("match_feedback")
      .select("match_id,feedback")
      .eq("user_id", userId)
      .in("match_id", matchIds)
      .returns<Array<{ match_id: string; feedback: NonNullable<RawApiMatch["feedback"]> }>>();
    if (error) {
      throw error;
    }

    return new Map((data ?? []).map((item) => [item.match_id, item.feedback]));
  }
}

function hashDealRoomInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isWorkspaceEditor(role: RawApiWorkspace["role"]) {
  return role === "owner" || role === "buyer";
}

export function buildSourcingSummary(
  list: RawApiSourcingList,
  shortlists: RawApiComparisonShortlist[],
  supplierNames: ReadonlyMap<string, string>,
): ApiSourcingSummary {
  const shortlistsByProduct = new Map<string, RawApiComparisonShortlist[]>();
  for (const shortlist of shortlists) {
    const productShortlists = shortlistsByProduct.get(shortlist.sourcing_list_product_id) ?? [];
    productShortlists.push(shortlist);
    shortlistsByProduct.set(shortlist.sourcing_list_product_id, productShortlists);
  }

  const exportRows = list.products.map((product) => {
    const productShortlists = shortlistsByProduct.get(product.id) ?? [];
    const selected = selectSummaryShortlist(productShortlists);
    return toSourcingExportRow(product, selected, supplierNames);
  });
  const costs = exportRows.filter(
    (row): row is ApiSourcingExportRow & { totalCost: number; totalCostCurrency: string } =>
      row.totalCost !== null && row.totalCostCurrency !== null,
  );
  const budgetCurrency = normalizeSummaryCurrency(list.target_budget_currency);
  const costCurrencies = new Set(costs.map((row) => row.totalCostCurrency));
  const estimatedCurrency =
    budgetCurrency ?? (costCurrencies.size === 1 ? [...costCurrencies][0] : null);
  const currencyMismatch =
    costCurrencies.size > 1 ||
    Boolean(budgetCurrency && [...costCurrencies].some((currency) => currency !== budgetCurrency));
  const comparableCosts = currencyMismatch
    ? costs.filter((row) => row.totalCostCurrency === estimatedCurrency)
    : costs;
  const currentEstimatedSourcingCost =
    comparableCosts.length > 0
      ? comparableCosts.reduce((total, row) => total + row.totalCost, 0)
      : null;
  const targetBudget = summaryNumber(list.target_budget);
  const budgetVariance =
    targetBudget !== null &&
    currentEstimatedSourcingCost !== null &&
    estimatedCurrency !== null &&
    budgetCurrency === estimatedCurrency
      ? targetBudget - currentEstimatedSourcingCost
      : null;
  const unknownCostProducts = exportRows.filter((row) => row.totalCost === null).length;
  const costDataComplete =
    list.products.length > 0 && unknownCostProducts === 0 && !currencyMismatch;

  return {
    totalProductsRequested: list.products.length,
    productsWithQualifyingResults: list.products.filter((product) =>
      (shortlistsByProduct.get(product.id) ?? []).some(
        (shortlist) => summaryOffer(shortlist).qualification === "qualifies",
      ),
    ).length,
    productsStillBeingSearched: list.products.filter(
      (product) => product.workflow_status === "searching",
    ).length,
    productsShortlisted: list.products.filter(
      (product) =>
        (shortlistsByProduct.get(product.id)?.length ?? 0) > 0 ||
        product.workflow_status === "shortlisted",
    ).length,
    productsCompleted: list.products.filter(
      (product) =>
        product.workflow_status === "completed" ||
        product.sourced_quantity >= product.target_quantity,
    ).length,
    totalRequestedQuantity: list.products.reduce(
      (total, product) => total + product.target_quantity,
      0,
    ),
    currentEstimatedSourcingCost,
    currentEstimatedSourcingCostCurrency: estimatedCurrency,
    targetBudget,
    targetBudgetCurrency: budgetCurrency,
    budgetVariance,
    potentialSavings:
      costDataComplete && budgetVariance !== null ? Math.max(0, budgetVariance) : null,
    costDataComplete,
    unknownCostProducts,
    currencyMismatch,
    exportRows,
  };
}

function toSourcingExportRow(
  product: RawApiSourcingList["products"][number],
  shortlist: RawApiComparisonShortlist | null,
  supplierNames: ReadonlyMap<string, string>,
): ApiSourcingExportRow {
  const offer = shortlist ? summaryOffer(shortlist) : null;
  const unitCost = offer ? summaryNumber(offer.price) : null;
  const unitCostCurrency = offer ? normalizeSummaryCurrency(offer.currency) : null;
  const estimatedLandedCost = offer ? summaryNumber(offer.landedUnitCost) : null;
  const estimatedLandedCostCurrency = offer
    ? normalizeSummaryCurrency(offer.landedUnitCostCurrency)
    : null;
  const costBasis =
    estimatedLandedCost !== null ? "landed_unit_cost" : unitCost !== null ? "unit_price" : null;
  const costCurrency =
    costBasis === "landed_unit_cost" ? estimatedLandedCostCurrency : unitCostCurrency;
  const costAmount = costBasis === "landed_unit_cost" ? estimatedLandedCost : unitCost;

  return {
    sourcingListProductId: product.id,
    sku: product.sku,
    product: product.product_name,
    quantity: product.target_quantity,
    selectedSupplier: shortlist
      ? (supplierNames.get(shortlist.supplier_id ?? "") ?? offer?.sellerName ?? null)
      : null,
    marketplace: shortlist?.marketplace_id ?? null,
    unitCost,
    unitCostCurrency,
    estimatedLandedCost,
    estimatedLandedCostCurrency,
    totalCost:
      costAmount !== null && costCurrency !== null ? costAmount * product.target_quantity : null,
    totalCostCurrency: costCurrency,
    url: offer?.url ?? null,
    status: product.workflow_status,
    notes: product.notes,
    costBasis,
    isEstimate: costAmount !== null,
  };
}

function selectSummaryShortlist(shortlists: RawApiComparisonShortlist[]) {
  if (shortlists.length === 0) return null;
  const qualifying = shortlists.filter(
    (shortlist) => summaryOffer(shortlist).qualification === "qualifies",
  );
  const candidates = qualifying.length > 0 ? qualifying : shortlists;
  const first = candidates[0]!;
  const firstOffer = summaryOffer(first);
  const firstAmount = summaryAmount(firstOffer);
  const firstCurrency = summaryCurrency(firstOffer);
  if (firstAmount === null || firstCurrency === null) return first;

  return candidates.reduce((best, candidate) => {
    const offer = summaryOffer(candidate);
    const amount = summaryAmount(offer);
    const currency = summaryCurrency(offer);
    if (amount === null || currency !== firstCurrency) return best;
    const bestOffer = summaryOffer(best);
    const bestAmount = summaryAmount(bestOffer);
    return bestAmount === null || amount < bestAmount ? candidate : best;
  }, first);
}

function summaryOffer(shortlist: RawApiComparisonShortlist) {
  return shortlist.offer_snapshot as Partial<MarketplaceComparisonOffer>;
}

function summaryAmount(offer: Partial<MarketplaceComparisonOffer>) {
  return summaryNumber(offer.landedUnitCost) ?? summaryNumber(offer.price);
}

function summaryCurrency(offer: Partial<MarketplaceComparisonOffer>) {
  return normalizeSummaryCurrency(
    summaryNumber(offer.landedUnitCost) !== null ? offer.landedUnitCostCurrency : offer.currency,
  );
}

function summaryNumber(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSummaryCurrency(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) return null;
  return value.trim().toUpperCase();
}

function toSupplierRow(input: ApiSupplierInput | ApiSupplierUpdateInput) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.marketplace !== undefined) row.marketplace_id = input.marketplace;
  if (input.marketplaceSellerId !== undefined) {
    row.marketplace_seller_id = input.marketplaceSellerId;
  }
  if (input.supplierUrl !== undefined) row.supplier_url = input.supplierUrl;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.tags !== undefined) row.tags = input.tags;
  if (input.status !== undefined) row.status = input.status;
  if (input.internalContactInfo !== undefined) {
    row.internal_contact_info = input.internalContactInfo;
  }
  if (input.typicalLeadTimeDays !== undefined) {
    row.typical_lead_time_days = input.typicalLeadTimeDays;
  }
  if (input.minimumOrderQuantity !== undefined) {
    row.minimum_order_quantity = input.minimumOrderQuantity;
  }
  return row;
}

function toSourcingListRow(
  defaultCurrency: string,
  input: ApiSourcingListUpdateInput,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.status !== undefined) row.status = input.status;
  if (input.targetBudget !== undefined) {
    row.target_budget = input.targetBudget;
    row.target_budget_currency =
      input.targetBudget === null
        ? null
        : (input.targetBudgetCurrency ?? defaultCurrency.toUpperCase());
  } else if (input.targetBudgetCurrency !== undefined) {
    row.target_budget_currency = input.targetBudgetCurrency;
  }
  return row;
}

function toSourcingProductRow(
  defaultCurrency: string,
  input: ApiSourcingListProductInput | ApiSourcingListProductUpdateInput,
) {
  const row: Record<string, unknown> = {};
  if (input.category !== undefined) row.category = input.category;
  if (input.productName !== undefined) row.product_name = input.productName;
  if (input.sku !== undefined) row.sku = input.sku;
  if (input.upc !== undefined) row.upc = input.upc;
  if (input.gtin !== undefined) row.gtin = input.gtin;
  if (input.mpn !== undefined) row.mpn = input.mpn;
  if (input.keywords !== undefined) row.keywords = input.keywords;
  if (input.targetQuantity !== undefined) row.target_quantity = input.targetQuantity;
  if (input.sourcedQuantity !== undefined) row.sourced_quantity = input.sourcedQuantity;
  if (input.targetUnitCost !== undefined) row.target_unit_cost = input.targetUnitCost;
  if (input.targetUnitCostCurrency !== undefined) {
    row.target_unit_cost_currency = input.targetUnitCostCurrency;
  } else if (input.targetUnitCost !== undefined) {
    row.target_unit_cost_currency = input.targetUnitCost === null ? null : defaultCurrency;
  }
  if (input.maxUnitCost !== undefined) row.max_unit_cost = input.maxUnitCost;
  if (input.maxUnitCostCurrency !== undefined) {
    row.max_unit_cost_currency = input.maxUnitCostCurrency;
  } else if (input.maxUnitCost !== undefined && input.maxUnitCost !== null) {
    row.max_unit_cost_currency = defaultCurrency;
  }
  if (input.estimatedShippingCost !== undefined) {
    row.estimated_shipping_cost = input.estimatedShippingCost;
  }
  if (input.estimatedShippingCurrency !== undefined) {
    row.estimated_shipping_currency = input.estimatedShippingCurrency;
  } else if (input.estimatedShippingCost !== undefined) {
    row.estimated_shipping_currency = input.estimatedShippingCost === null ? null : defaultCurrency;
  }
  if (input.estimatedDutiesTaxes !== undefined) {
    row.estimated_duties_taxes = input.estimatedDutiesTaxes;
  }
  if (input.estimatedDutiesTaxesCurrency !== undefined) {
    row.estimated_duties_taxes_currency = input.estimatedDutiesTaxesCurrency;
  } else if (input.estimatedDutiesTaxes !== undefined) {
    row.estimated_duties_taxes_currency =
      input.estimatedDutiesTaxes === null ? null : defaultCurrency;
  }
  if (input.otherSourcingCost !== undefined) {
    row.other_sourcing_cost = input.otherSourcingCost;
  }
  if (input.otherSourcingCostCurrency !== undefined) {
    row.other_sourcing_cost_currency = input.otherSourcingCostCurrency;
  } else if (input.otherSourcingCost !== undefined) {
    row.other_sourcing_cost_currency = input.otherSourcingCost === null ? null : defaultCurrency;
  }
  if (input.desiredRetailPrice !== undefined) row.desired_retail_price = input.desiredRetailPrice;
  if (input.desiredRetailPriceCurrency !== undefined) {
    row.desired_retail_price_currency = input.desiredRetailPriceCurrency;
  } else if (input.desiredRetailPrice !== undefined) {
    row.desired_retail_price_currency = input.desiredRetailPrice === null ? null : defaultCurrency;
  }
  if (input.minimumDesiredMarginPercent !== undefined) {
    row.minimum_desired_margin_percent = input.minimumDesiredMarginPercent;
  }
  if (input.desiredRoiPercent !== undefined) row.desired_roi_percent = input.desiredRoiPercent;
  if (input.estimatedResaleFees !== undefined) {
    row.estimated_resale_fees = input.estimatedResaleFees;
  }
  if (input.estimatedResaleFeesCurrency !== undefined) {
    row.estimated_resale_fees_currency = input.estimatedResaleFeesCurrency;
  } else if (input.estimatedResaleFees !== undefined) {
    row.estimated_resale_fees_currency =
      input.estimatedResaleFees === null ? null : defaultCurrency;
  }
  if (input.maxLandedUnitCost !== undefined) {
    row.max_landed_unit_cost = input.maxLandedUnitCost;
  }
  if (input.maxLandedUnitCostCurrency !== undefined) {
    row.max_landed_unit_cost_currency = input.maxLandedUnitCostCurrency;
  } else if (input.maxLandedUnitCost !== undefined) {
    row.max_landed_unit_cost_currency = input.maxLandedUnitCost === null ? null : defaultCurrency;
  }
  if (input.alertCostBasis !== undefined) row.alert_cost_basis = input.alertCostBasis;
  if (input.alertEnabled !== undefined) row.alert_enabled = input.alertEnabled;
  if (input.alertTargetPriceReached !== undefined) {
    row.alert_target_price_reached = input.alertTargetPriceReached;
  }
  if (input.alertNewCheaperSource !== undefined) {
    row.alert_new_cheaper_source = input.alertNewCheaperSource;
  }
  if (input.alertPriceDropped !== undefined) row.alert_price_dropped = input.alertPriceDropped;
  if (input.alertQuantityAvailable !== undefined) {
    row.alert_quantity_available = input.alertQuantityAvailable;
  }
  if (input.alertBackInStock !== undefined) row.alert_back_in_stock = input.alertBackInStock;
  if (input.alertCooldownMinutes !== undefined) {
    row.alert_cooldown_minutes = input.alertCooldownMinutes;
  }
  if (input.preferredCondition !== undefined) row.preferred_condition = input.preferredCondition;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.requiredBy !== undefined) row.required_by = input.requiredBy;
  if (input.assignedTo !== undefined) row.assigned_to = input.assignedTo;
  if (input.workflowStatus !== undefined) row.workflow_status = input.workflowStatus;
  return row;
}

function toNullableNumber(value: number | string | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function toPage<T>(items: T[], limit: number, cursorValue: (item: T) => string): Page<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    items: pageItems,
    nextCursor: hasMore ? cursorValue(pageItems[pageItems.length - 1]!) : null,
    hasMore,
  };
}

function toPriceTarget(
  listing: RawApiListing,
  target: { max?: number; currency?: string } | undefined,
) {
  if (target?.max === undefined) {
    return null;
  }

  const targetCurrency = normalizeCurrency(target.currency);
  const listingCurrency = normalizeCurrency(listing.currency);
  const sameCurrency = Boolean(
    targetCurrency && listingCurrency && targetCurrency === listingCurrency,
  );

  return {
    price: target.max,
    currency: targetCurrency,
    difference: sameCurrency && listing.price !== null ? listing.price - target.max : null,
    sameCurrency,
  };
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || null;
}

function summarizeLegacyListingPriceHistory(
  listing: RawApiListing,
  observations: readonly StoredPriceObservation[],
) {
  return summarizePriceHistory(
    listing.price,
    listing.currency,
    observations
      .map((observation) => ({
        price: Number(observation.price),
        currency: observation.currency,
        observedAt: observation.observed_at,
      }))
      .filter((observation) => Number.isFinite(observation.price)),
  );
}

function normalizeSupplierName(name: string | null | undefined) {
  const normalized = name?.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function unwrap<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
