import type {
  MarketplaceCapabilities,
  MarketplaceErrorCategory,
  MarketplaceListing,
  MarketplaceListingRelevance,
  MarketplaceProductMetadata,
  MarketplaceSource,
} from "../marketplaces/shared/types";
import type {
  MarketplaceComparisonOffer,
  MarketplaceProductComparison,
  MarketplaceListingReference,
} from "../marketplaces/comparison";
import type { MarketplaceDuplicateGroup } from "../listings/deduplication";
import { isMarketplaceProductMetadata } from "../listings/relevance";
import type { DealDropSearchIntent } from "../listings/relevance";
import type { DealIndicator, PriceHistoryStatus } from "../pricing/price-history";
import type {
  WatchlistAlertMode,
  WatchlistFilters,
  WatchlistLifecycleState,
  WatchlistMarketplaceScope,
} from "../types/backend";

export interface ApiPagination {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ApiMeta {
  requestId: string;
  pagination?: ApiPagination;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export type ListingProblemReportCategory =
  "broken_link" | "wrong_price" | "stale_listing" | "incorrect_match" | "missing_image" | "other";

export interface ListingProblemReportInput {
  category: ListingProblemReportCategory;
  listingId: string;
  marketplace: MarketplaceSource;
  matchId?: string | null;
  watchlistId?: string | null;
  appVersion: string;
  idempotencyKey: string;
}

export interface ApiListingProblemReport {
  reportId: string;
  status: "received";
}

export interface ApiListing {
  id: string | null;
  source: MarketplaceSource;
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  url: string;
  imageUrls: string[];
  sellerName: string | null;
  location: string | null;
  category: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  listedAt: string | null;
  fetchedAt: string | null;
  matchedAt: string | null;
  isFavorite: boolean;
  priceHistory: ApiPriceHistorySummary | null;
  priceTarget: ApiPriceTarget | null;
  product: MarketplaceProductMetadata | null;
  relevance: MarketplaceListingRelevance | null;
}

export interface ApiPriceHistorySummary {
  status: PriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  dealIndicator: DealIndicator | null;
  explanation: string;
}

export interface ApiPriceTarget {
  price: number;
  currency: string | null;
  difference: number | null;
  sameCurrency: boolean;
}

export interface ApiMarketplace {
  source: MarketplaceSource;
  enabled: boolean;
  capabilities: MarketplaceCapabilities | null;
}

export interface ApiSearchPartialFailure {
  source: MarketplaceSource;
  category: MarketplaceErrorCategory;
  message: string;
}

export interface ApiSearchResult {
  listings: ApiListing[];
  intent: DealDropSearchIntent;
  filteredCount: number;
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  deduplication: {
    duplicateGroups: MarketplaceDuplicateGroup[];
    suppressedCount: number;
  };
}

export interface ApiWatchlist {
  id: string;
  name: string;
  searchQuery: string;
  filters: WatchlistFilters;
  alertMode: WatchlistAlertMode;
  marketplaceScope: WatchlistMarketplaceScope;
  marketplaceIds: MarketplaceSource[];
  isActive: boolean;
  isFavorite: boolean;
  lifecycleState: WatchlistLifecycleState;
  snoozedUntil: string | null;
  completedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApiWorkspaceRole = "owner" | "buyer" | "viewer";

export interface ApiWorkspace {
  id: string;
  name: string;
  businessType: string;
  primarySourcingCategories: string[];
  defaultCurrency: string;
  countryRegion: string;
  role: ApiWorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface ApiWorkspaceInput {
  name: string;
  businessType: string;
  primarySourcingCategories: string[];
  defaultCurrency: string;
  countryRegion: string;
}

export interface ApiWorkspaceMember {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: ApiWorkspaceRole;
  createdAt: string;
}

export interface ApiWorkspaceMemberInput {
  email: string;
  role: Exclude<ApiWorkspaceRole, "owner">;
}

export type ApiSourcingWorkflowStatus =
  "searching" | "shortlisted" | "ready_to_buy" | "ordered" | "skipped" | "completed";

export type ApiSourcingListStatus = "active" | "paused" | "completed";
export type ApiSourcingAlertCostBasis = "marketplace_price" | "landed_unit_cost";

export interface ApiSourcingListProduct {
  id: string;
  category: string;
  productName: string;
  sku: string | null;
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
  keywords: string[];
  targetQuantity: number;
  sourcedQuantity: number;
  targetUnitCost: number | null;
  targetUnitCostCurrency: string | null;
  maxUnitCost: number | null;
  maxUnitCostCurrency: string | null;
  estimatedShippingCost: number | null;
  estimatedShippingCurrency: string | null;
  estimatedDutiesTaxes: number | null;
  estimatedDutiesTaxesCurrency: string | null;
  otherSourcingCost: number | null;
  otherSourcingCostCurrency: string | null;
  desiredRetailPrice: number | null;
  desiredRetailPriceCurrency: string | null;
  minimumDesiredMarginPercent: number | null;
  maxLandedUnitCost: number | null;
  maxLandedUnitCostCurrency: string | null;
  alertCostBasis: ApiSourcingAlertCostBasis;
  alertEnabled: boolean;
  alertTargetPriceReached: boolean;
  alertNewCheaperSource: boolean;
  alertPriceDropped: boolean;
  alertQuantityAvailable: boolean;
  alertBackInStock: boolean;
  alertCooldownMinutes: number;
  preferredCondition: string | null;
  marketplaceIds: MarketplaceSource[];
  notes: string | null;
  requiredBy: string | null;
  assignedTo: string | null;
  workflowStatus: ApiSourcingWorkflowStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSourcingListProgress {
  totalProducts: number;
  completedProducts: number;
  targetQuantity: number;
  sourcedQuantity: number;
  percentComplete: number;
}

export interface ApiSourcingList {
  id: string;
  workspaceId: string;
  name: string;
  status: ApiSourcingListStatus;
  products: ApiSourcingListProduct[];
  progress: ApiSourcingListProgress;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSourcingListProductInput {
  category: string;
  productName: string;
  sku?: string | null;
  upc?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  keywords?: string[];
  targetQuantity: number;
  sourcedQuantity?: number;
  targetUnitCost?: number | null;
  targetUnitCostCurrency?: string | null;
  maxUnitCost?: number | null;
  maxUnitCostCurrency?: string | null;
  estimatedShippingCost?: number | null;
  estimatedShippingCurrency?: string | null;
  estimatedDutiesTaxes?: number | null;
  estimatedDutiesTaxesCurrency?: string | null;
  otherSourcingCost?: number | null;
  otherSourcingCostCurrency?: string | null;
  desiredRetailPrice?: number | null;
  desiredRetailPriceCurrency?: string | null;
  minimumDesiredMarginPercent?: number | null;
  maxLandedUnitCost?: number | null;
  maxLandedUnitCostCurrency?: string | null;
  alertCostBasis?: ApiSourcingAlertCostBasis;
  alertEnabled?: boolean;
  alertTargetPriceReached?: boolean;
  alertNewCheaperSource?: boolean;
  alertPriceDropped?: boolean;
  alertQuantityAvailable?: boolean;
  alertBackInStock?: boolean;
  alertCooldownMinutes?: number;
  preferredCondition?: string | null;
  marketplaceIds: MarketplaceSource[];
  notes?: string | null;
  requiredBy?: string | null;
  assignedTo?: string | null;
  workflowStatus?: ApiSourcingWorkflowStatus;
}

export interface ApiSourcingNote {
  id: string;
  sourcingListProductId: string | null;
  comparisonShortlistId: string | null;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSourcingActivity {
  id: string;
  actorId: string;
  actorName: string | null;
  sourcingListId: string | null;
  sourcingListProductId: string | null;
  eventType:
    | "sourcing_item_created"
    | "assignment_changed"
    | "offer_shortlisted"
    | "status_changed"
    | "item_completed"
    | "note_added";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ApiComparisonOffer = MarketplaceComparisonOffer;
export type ApiProductComparison = MarketplaceProductComparison;

export interface ApiComparisonShortlist {
  id: string;
  sourcingListProductId: string;
  supplierId: string | null;
  offer: ApiComparisonOffer;
  createdAt: string;
}

export interface ApiComparisonShortlistInput {
  sourcingListProductId: string;
  offer: ApiComparisonOffer;
  supplierId?: string | null;
}

export interface ApiSupplierShortlistHistory {
  id: string;
  supplierId: string;
  sourcingListProductId: string;
  marketplace: MarketplaceSource;
  externalId: string;
  listingId: string | null;
  offer: ApiComparisonOffer;
  firstShortlistedAt: string;
  lastShortlistedAt: string;
}

export interface ApiComparisonManualGroup {
  id: string;
  sourcingListProductId: string;
  members: MarketplaceListingReference[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiComparisonManualGroupInput {
  sourcingListProductId: string;
  members: MarketplaceListingReference[];
}

export interface ApiComparisonResult {
  sourcingListProduct: ApiSourcingListProduct;
  searchQuery: string;
  comparisons: ApiProductComparison[];
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  shortlisted: ApiComparisonShortlist[];
  manualGroups: ApiComparisonManualGroup[];
}

export interface ApiSourcingListInput {
  name: string;
  status?: ApiSourcingListStatus;
  products: ApiSourcingListProductInput[];
}

export interface ApiSourcingListUpdateInput {
  name?: string;
  status?: ApiSourcingListStatus;
}

export interface ApiSourcingListProductUpdateInput extends Partial<ApiSourcingListProductInput> {}

export type ApiSupplierStatus = "preferred" | "avoid" | "unreviewed";

export interface ApiSupplier {
  id: string;
  workspaceId: string;
  name: string;
  marketplace: MarketplaceSource;
  marketplaceSellerId: string | null;
  supplierUrl: string | null;
  notes: string | null;
  tags: string[];
  status: ApiSupplierStatus;
  internalContactInfo: string | null;
  typicalLeadTimeDays: number | null;
  minimumOrderQuantity: number | null;
  shortlistedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSupplierInput {
  name: string;
  marketplace: MarketplaceSource;
  marketplaceSellerId?: string | null;
  supplierUrl?: string | null;
  notes?: string | null;
  tags?: string[];
  status?: ApiSupplierStatus;
  internalContactInfo?: string | null;
  typicalLeadTimeDays?: number | null;
  minimumOrderQuantity?: number | null;
}

export interface ApiSupplierUpdateInput extends Partial<ApiSupplierInput> {}

export interface ApiSupplierFilters {
  query?: string;
  marketplace?: MarketplaceSource;
  status?: ApiSupplierStatus;
}

export interface ApiSourcingListImportInput {
  fileFingerprint: string;
  products: ApiSourcingListProductInput[];
}

export interface ApiSourcingListImportResult {
  list: ApiSourcingList;
  importedCount: number;
  duplicateImport: boolean;
}

export type ApiSourcingPriceMovement = "up" | "down" | "stable" | "unknown";

export interface ApiSourcingPriceObservation {
  id: string;
  source: MarketplaceSource;
  externalId: string;
  listingId: string | null;
  title: string;
  sellerName: string | null;
  url: string;
  observedPrice: number | null;
  currency: string | null;
  availableQuantity: number | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  landedUnitCost: number | null;
  landedUnitCostCurrency: string | null;
  availability: string | null;
  observedAt: string;
}

export interface ApiSourcingPriceSourceSummary {
  source: MarketplaceSource;
  currentObservedPrice: number | null;
  currentObservedCurrency: string | null;
  currentObservedAt: string | null;
  recentLow: number | null;
  recentHigh: number | null;
  averageObservedPrice: number | null;
  currency: string | null;
  observationCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  movement: ApiSourcingPriceMovement;
  targetReached: boolean | null;
}

export interface ApiSourcingPriceHistory {
  sourcingListProductId: string;
  targetPrice: number | null;
  targetPriceCurrency: string | null;
  targetCostBasis: ApiSourcingAlertCostBasis;
  totalObservationCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  sources: ApiSourcingPriceSourceSummary[];
  observations: ApiSourcingPriceObservation[];
}

export interface ApiMatch {
  id: string;
  status: "unread" | "read" | "dismissed";
  feedback: "relevant" | "not_relevant" | null;
  matchedAt: string;
  watchlist: Pick<ApiWatchlist, "id" | "name">;
  listing: ApiListing;
}

export interface ApiNotification {
  id: string;
  matchId: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface ApiNotificationPreferences {
  pushEnabled: boolean;
  newMatchEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  dailyAlertLimit: number;
  weeklySummaryEnabled: boolean;
}

export interface ApiWeeklySummary {
  enabled: boolean;
  shouldShow: boolean;
  periodStart: string;
  periodEnd: string;
  hasActivity: boolean;
  activeWatchlistCount: number;
  newMatches: number;
  savedListings: number;
  priceDrops: number;
  latestMatchId: string | null;
  savedListingIds: string[];
  priceDropListingIds: string[];
  quietWatchlists: Array<{
    id: string;
    name: string;
    lastMatchAt: string | null;
  }>;
}

export interface ApiPushTokenRegistration {
  expoPushToken: string;
  platform: "ios" | "android" | "web";
}

export interface StoredListingReference {
  id: string;
  marketplace_id: string;
  external_id: string;
}

export interface RawApiListing {
  id: string;
  marketplace_id: MarketplaceSource;
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
  fetched_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  raw_data: Record<string, unknown>;
  normalized_data?: Record<string, unknown>;
}

export interface RawApiWatchlist {
  id: string;
  user_id: string;
  marketplace_id: MarketplaceSource;
  marketplace_scope: WatchlistMarketplaceScope;
  name: string;
  search_query: string;
  filters: WatchlistFilters;
  alert_mode: WatchlistAlertMode;
  is_active: boolean;
  is_favorite: boolean;
  lifecycle_state: WatchlistLifecycleState;
  snoozed_until: string | null;
  completed_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  watchlist_marketplaces?: Array<{ marketplace_id: MarketplaceSource }>;
}

export interface RawApiWorkspace {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  primary_sourcing_categories: string[];
  default_currency: string;
  country_region: string;
  role: ApiWorkspaceRole;
  created_at: string;
  updated_at: string;
}

export interface RawApiSourcingListProduct {
  id: string;
  sourcing_list_id: string;
  category: string;
  product_name: string;
  sku: string | null;
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
  keywords: string[];
  target_quantity: number;
  sourced_quantity: number;
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
  desired_retail_price: number | string | null;
  desired_retail_price_currency: string | null;
  minimum_desired_margin_percent: number | string | null;
  max_landed_unit_cost: number | string | null;
  max_landed_unit_cost_currency: string | null;
  alert_cost_basis: ApiSourcingAlertCostBasis;
  alert_enabled: boolean;
  alert_target_price_reached: boolean;
  alert_new_cheaper_source: boolean;
  alert_price_dropped: boolean;
  alert_quantity_available: boolean;
  alert_back_in_stock: boolean;
  alert_cooldown_minutes: number;
  preferred_condition: string | null;
  notes: string | null;
  required_by: string | null;
  assigned_to: string | null;
  workflow_status: ApiSourcingWorkflowStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  sourcing_list_product_marketplaces?: Array<{ marketplace_id: MarketplaceSource }>;
}

export interface RawApiWorkspaceMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: ApiWorkspaceRole;
  created_at: string;
}

export interface RawApiSourcingNote {
  id: string;
  workspace_id: string;
  sourcing_list_product_id: string | null;
  comparison_shortlist_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: { full_name: string | null; email: string | null } | null;
}

export interface RawApiSourcingActivity {
  id: string;
  workspace_id: string;
  actor_id: string;
  sourcing_list_id: string | null;
  sourcing_list_product_id: string | null;
  event_type: ApiSourcingActivity["eventType"];
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { full_name: string | null; email: string | null } | null;
}

export interface RawApiSourcingPriceObservation {
  id: string;
  workspace_id: string;
  sourcing_list_product_id: string;
  listing_id: string | null;
  marketplace_id: MarketplaceSource;
  external_id: string;
  title: string;
  seller_name: string | null;
  url: string;
  observed_at: string;
  observed_price: number | string | null;
  currency: string | null;
  available_quantity: number | null;
  shipping_cost: number | string | null;
  shipping_currency: string | null;
  landed_unit_cost: number | string | null;
  landed_unit_cost_currency: string | null;
  availability: string | null;
}

export interface RawApiSourcingAlertState {
  workspace_id: string;
  sourcing_list_product_id: string;
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
  last_notified_type: string | null;
}

export interface RawApiSourcingList {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  status: ApiSourcingListStatus;
  created_at: string;
  updated_at: string;
  products: RawApiSourcingListProduct[];
}

export interface RawApiComparisonShortlist {
  id: string;
  workspace_id: string;
  sourcing_list_product_id: string;
  marketplace_id: MarketplaceSource;
  external_id: string;
  listing_id: string | null;
  supplier_id: string | null;
  offer_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface RawApiSupplier {
  id: string;
  workspace_id: string;
  name: string;
  marketplace_id: MarketplaceSource;
  marketplace_seller_id: string | null;
  supplier_url: string | null;
  notes: string | null;
  tags: string[];
  status: ApiSupplierStatus;
  internal_contact_info: string | null;
  typical_lead_time_days: number | null;
  minimum_order_quantity: number | null;
  shortlisted_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RawApiSupplierShortlistHistory {
  id: string;
  workspace_id: string;
  supplier_id: string;
  sourcing_list_product_id: string;
  marketplace_id: MarketplaceSource;
  external_id: string;
  listing_id: string | null;
  offer_snapshot: Record<string, unknown>;
  first_shortlisted_at: string;
  last_shortlisted_at: string;
  last_shortlisted_by: string;
}

export interface RawApiComparisonManualGroup {
  id: string;
  workspace_id: string;
  sourcing_list_product_id: string;
  member_refs: MarketplaceListingReference[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RawApiMatch {
  id: string;
  watchlist_id: string;
  listing_id: string;
  status: ApiMatch["status"];
  feedback?: ApiMatch["feedback"];
  matched_at: string;
  listing: RawApiListing | RawApiListing[] | null;
  watchlist:
    Pick<RawApiWatchlist, "id" | "name"> | Array<Pick<RawApiWatchlist, "id" | "name">> | null;
}

export interface RawApiNotification {
  id: string;
  match_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export function toApiListing(
  listing: MarketplaceListing | RawApiListing,
  options: {
    id?: string | null;
    matchedAt?: string | null;
    isFavorite?: boolean;
    priceHistory?: ApiPriceHistorySummary | null;
    priceTarget?: ApiPriceTarget | null;
  } = {},
): ApiListing {
  const isNormalized = "externalId" in listing;

  return {
    id: options.id ?? (isNormalized ? null : listing.id),
    source: isNormalized ? listing.source : listing.marketplace_id,
    externalId: isNormalized ? listing.externalId : listing.external_id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    imageUrls: isNormalized
      ? listing.imageUrls
      : extractImageUrls(listing.image_url, listing.raw_data),
    sellerName: isNormalized ? listing.sellerName : listing.seller_name,
    location: listing.location,
    category: listing.category,
    condition: listing.condition,
    latitude: listing.latitude,
    longitude: listing.longitude,
    listedAt: isNormalized ? listing.postedAt : listing.posted_at,
    fetchedAt: isNormalized ? null : listing.fetched_at,
    matchedAt: options.matchedAt ?? null,
    isFavorite: options.isFavorite ?? false,
    priceHistory: options.priceHistory ?? null,
    priceTarget: options.priceTarget ?? null,
    product: isNormalized
      ? (listing.product ?? null)
      : isMarketplaceProductMetadata(listing.normalized_data)
        ? listing.normalized_data
        : null,
    relevance: isNormalized ? (listing.relevance ?? null) : null,
  };
}

function extractImageUrls(imageUrl: string | null, rawData: Record<string, unknown>) {
  const images = rawData.imageUrls ?? rawData.images ?? rawData.image_urls;
  const additionalImages = Array.isArray(images)
    ? images.filter((image): image is string => typeof image === "string")
    : [];

  return [
    ...new Set([imageUrl, ...additionalImages].filter((image): image is string => Boolean(image))),
  ];
}
