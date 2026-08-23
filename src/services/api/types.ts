export type MarketplaceSource = "amazon_business" | "ebay" | "etsy" | "rakuten";

export type ApiListingProblemReportCategory =
  "broken_link" | "wrong_price" | "stale_listing" | "incorrect_match" | "missing_image" | "other";

export interface ApiListingProblemReportInput {
  category: ApiListingProblemReportCategory;
  listingId: string;
  marketplace: MarketplaceSource;
  matchId?: string | null;
  watchlistId?: string | null;
  appVersion: string;
  idempotencyKey: string;
}

export interface ApiListingProblemReportResponse {
  reportId: string;
  status: "received";
}

export type WatchlistMarketplaceScope = "selected" | "all";
export type WatchlistAlertMode = "instant" | "digest";
export type WatchlistLifecycleState = "active" | "paused" | "snoozed" | "completed";

export interface ApiPagination {
  nextCursor: string | null;
  hasMore: boolean;
  limit?: number;
}

export interface ApiMeta {
  requestId: string;
  pagination?: ApiPagination;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
  };
}

export interface ApiMarketplaceCapabilities {
  supportsPriceFiltering: boolean;
  supportsLocation: boolean;
  supportsRadius: boolean;
  supportsCondition: boolean;
  supportsPagination: boolean;
  supportsProductIdentifiers?: boolean;
  supportsOffers?: boolean;
  supportsMerchantFilters?: boolean;
  supportsDeliveryInformation?: boolean;
}

export interface ApiMarketplace {
  source: MarketplaceSource;
  enabled: boolean;
  capabilities: ApiMarketplaceCapabilities | null;
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
  product: ApiProductMetadata | null;
  relevance: ApiListingRelevance | null;
}

export type ApiPriceHistoryStatus = "available" | "insufficient_history" | "unavailable";
export type ApiDealIndicator = "below_history" | "typical" | "above_history";

export interface ApiPriceHistorySummary {
  status: ApiPriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  dealIndicator: ApiDealIndicator | null;
  explanation: string;
}

export interface ApiPriceTarget {
  price: number;
  currency: string | null;
  difference: number | null;
  sameCurrency: boolean;
}

export type ApiProductCategory =
  | "accessories"
  | "apparel"
  | "beauty"
  | "books"
  | "cameras"
  | "collectibles"
  | "computers"
  | "electronics"
  | "footwear"
  | "home"
  | "sports"
  | "vehicles"
  | "phones"
  | "other";

export interface ApiProductMetadata {
  category: ApiProductCategory | null;
  productType: string | null;
  brand: string | null;
  model: string | null;
  attributes: Record<string, string>;
  confidence: "low" | "medium" | "high";
  classificationSource: "marketplace" | "title" | "mixed" | "unknown";
}

export interface ApiListingRelevance {
  score: number;
  confidence: "low" | "medium" | "high";
  excluded: boolean;
  reasons: string[];
  warnings: string[];
}

export interface ApiSearchIntent {
  rawQuery: string;
  normalizedQuery: string;
  requiredTerms: string[];
  excludedTerms: string[];
  category: ApiProductCategory | null;
  brand: string | null;
  model: string | null;
  productType: string | null;
  attributes: Record<string, string>;
  intentConfidence: "low" | "medium" | "high";
  strictCategory: boolean;
}

export interface ApiSearchPriceFilter {
  min?: number;
  max?: number;
  currency?: string;
}

export interface ApiSearchLocationFilter {
  name: string;
}

export interface ApiSearchDistanceFilter {
  maxKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface ApiSearchFilters {
  aliases?: string[];
  excludedKeywords?: string[];
  location?: string | ApiSearchLocationFilter;
  price?: ApiSearchPriceFilter;
  distance?: ApiSearchDistanceFilter;
  conditions?: string[];
}

export interface ApiSearchRequest {
  searchQuery: string;
  sources?: MarketplaceSource[] | "all";
  filters?: ApiSearchFilters;
  productIdentifiers?: ApiProductIdentifier[];
  pagination?: {
    cursor?: string | null;
    limit?: number;
  };
}

export type ApiProductIdentifierType =
  "asin" | "upc" | "ean" | "isbn" | "sku" | "part_number" | "oem_part_number";

export interface ApiProductIdentifier {
  type: ApiProductIdentifierType;
  value: string;
}

export interface ApiSearchPartialFailure {
  source: MarketplaceSource;
  category: string;
  message: string;
}

export interface ApiSearchResult {
  listings: ApiListing[];
  intent: ApiSearchIntent;
  filteredCount: number;
  sources: MarketplaceSource[];
  partialFailures: ApiSearchPartialFailure[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  deduplication: {
    duplicateGroups: Record<string, unknown>[];
    suppressedCount: number;
  };
}

export interface ApiWatchlist {
  id: string;
  name: string;
  searchQuery: string;
  filters: ApiSearchFilters;
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

export interface ApiWatchlistInput {
  name: string;
  searchQuery: string;
  filters?: ApiSearchFilters;
  alertMode?: WatchlistAlertMode;
  marketplaceScope?: WatchlistMarketplaceScope;
  marketplaceIds?: MarketplaceSource[];
  isActive?: boolean;
  isFavorite?: boolean;
  lifecycleState?: WatchlistLifecycleState;
  snoozedUntil?: string | null;
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

export type ApiProFeature =
  | "business_workspace"
  | "sourcing_lists"
  | "bulk_import"
  | "higher_search_watch_limits"
  | "professional_cost_criteria"
  | "price_history"
  | "sourcing_opportunity_alerts"
  | "supplier_management"
  | "exports"
  | "team_collaboration";

export type ApiProEntitlementSource = "subscription" | "pilot" | "admin";

export interface ApiProEntitlement {
  isPro: boolean;
  plan: "free" | "pro";
  source: ApiProEntitlementSource | null;
  startsAt: string | null;
  expiresAt: string | null;
  workspaceId: string | null;
  features: ApiProFeature[];
  limits: {
    maxWatchlists: number;
    maxSearchesPerDay: number;
  } | null;
}

export interface ApiWorkspaceMember {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: ApiWorkspaceRole;
  createdAt: string;
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
  targetBudget: number | null;
  targetBudgetCurrency: string | null;
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

export type ApiComparisonMatchMethod = "identifier" | "model_title" | "manual";
export type ApiComparisonQualification = "qualifies" | "does_not_qualify" | "unknown";

export interface ApiComparisonOffer {
  source: MarketplaceSource;
  externalId: string;
  offerId: string;
  listingId: string | null;
  title: string;
  sellerName: string | null;
  sellerId?: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  url: string;
  availableQuantity: number | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  landedUnitCost: number | null;
  landedUnitCostCurrency: string | null;
  condition: string | null;
  deliveryInformation: string | null;
  availability: string | null;
  qualification: ApiComparisonQualification;
  qualificationReasons: string[];
  isShortlisted: boolean;
  savedSupplier?: {
    id: string;
    name: string;
    status: ApiSupplierStatus;
  } | null;
}

export interface ApiProductComparison {
  id: string;
  title: string;
  matchMethod: ApiComparisonMatchMethod;
  confidence: "medium" | "high";
  sources: MarketplaceSource[];
  offers: ApiComparisonOffer[];
  cheapestRawOfferId: string | null;
  cheapestLandedOfferId: string | null;
  cheapestQualifyingOfferId: string | null;
  cheapestQualifyingLandedOfferId: string | null;
  cheapestRawCurrency: string | null;
  cheapestLandedCurrency: string | null;
  currenciesCompared: string[];
  rawAndLandedWinnersDiffer: boolean;
}

export interface ApiComparisonShortlist {
  id: string;
  sourcingListProductId: string;
  supplierId: string | null;
  offer: ApiComparisonOffer;
  createdAt: string;
}

export interface ApiComparisonManualGroup {
  id: string;
  sourcingListProductId: string;
  members: { source: MarketplaceSource; externalId: string }[];
  createdAt: string;
  updatedAt: string;
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

export interface ApiComparisonShortlistInput {
  sourcingListProductId: string;
  offer: ApiComparisonOffer;
  supplierId?: string | null;
}

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

export type ApiSupplierUpdateInput = Partial<ApiSupplierInput>;

export interface ApiSupplierFilters {
  query?: string;
  marketplace?: MarketplaceSource;
  status?: ApiSupplierStatus;
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

export interface ApiComparisonManualGroupInput {
  sourcingListProductId: string;
  members: { source: MarketplaceSource; externalId: string }[];
}

export interface ApiSourcingListInput {
  name: string;
  status?: ApiSourcingListStatus;
  targetBudget?: number | null;
  targetBudgetCurrency?: string | null;
  products: ApiSourcingListProductInput[];
}

export interface ApiSourcingListUpdateInput {
  name?: string;
  status?: ApiSourcingListStatus;
  targetBudget?: number | null;
  targetBudgetCurrency?: string | null;
}

export interface ApiSourcingExportRow {
  sourcingListProductId: string;
  sku: string | null;
  product: string;
  quantity: number;
  selectedSupplier: string | null;
  marketplace: MarketplaceSource | null;
  unitCost: number | null;
  unitCostCurrency: string | null;
  estimatedLandedCost: number | null;
  estimatedLandedCostCurrency: string | null;
  totalCost: number | null;
  totalCostCurrency: string | null;
  url: string | null;
  status: ApiSourcingWorkflowStatus;
  notes: string | null;
  costBasis: "landed_unit_cost" | "unit_price" | null;
  isEstimate: boolean;
}

export interface ApiSourcingSummary {
  totalProductsRequested: number;
  productsWithQualifyingResults: number;
  productsStillBeingSearched: number;
  productsShortlisted: number;
  productsCompleted: number;
  totalRequestedQuantity: number;
  currentEstimatedSourcingCost: number | null;
  currentEstimatedSourcingCostCurrency: string | null;
  targetBudget: number | null;
  targetBudgetCurrency: string | null;
  budgetVariance: number | null;
  potentialSavings: number | null;
  costDataComplete: boolean;
  unknownCostProducts: number;
  currencyMismatch: boolean;
  exportRows: ApiSourcingExportRow[];
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

export interface ApiMatchQuery {
  includeDismissed?: boolean;
  status?: "dismissed";
  cursor?: string | null;
  limit?: number;
}

export interface ApiNotificationQuery {
  cursor?: string | null;
  limit?: number;
}

export interface ApiListingQuery {
  cursor?: string | null;
  limit?: number;
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

export type ApiProductEventName =
  | "account_activated"
  | "first_watchlist_created"
  | "push_permission_result"
  | "first_match_received"
  | "notification_opened"
  | "listing_opened_externally"
  | "listing_favorited"
  | "match_dismissed_not_relevant"
  | "match_marked_relevant"
  | "match_opened"
  | "watchlist_paused"
  | "watchlist_resumed"
  | "watchlist_completed"
  | "pro_upgrade_viewed"
  | "pro_upgrade_cta_tapped"
  | "pro_feature_used";

export interface ApiProductEventInput {
  eventName: ApiProductEventName;
  eventKey: string;
  properties: Record<string, string | number | boolean | null>;
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
  quietWatchlists: {
    id: string;
    name: string;
    lastMatchAt: string | null;
  }[];
}

export interface ApiPushTokenRegistration {
  expoPushToken: string;
  platform: "ios" | "android" | "web";
}
