import {
  getEnabledMarketplaceSources,
  getMarketplaceCatalog,
  type MarketplaceAdapterRegistry,
} from "../marketplaces/catalog";
import { MarketplaceSearchCoordinator } from "../marketplaces/search/coordinator";
import type { MarketplaceSearchCoordinatorRequest } from "../marketplaces/search/types";
import {
  buildMarketplaceComparison,
  type ComparisonCriteria,
  type ComparisonManualGroup,
  type MarketplaceComparisonOffer,
  type MarketplaceProductComparison,
} from "../marketplaces/comparison";
import {
  buildProductRecommendation,
  rankMarketplaceAlternatives,
  type RecommendationHistory,
  type RecommendationOffer,
  type RecommendationTarget,
} from "../intelligence";
import {
  MARKETPLACE_IDS,
  type MarketplaceListing,
  type MarketplaceProductIdentifier,
  type MarketplaceSource,
} from "../marketplaces/shared/types";
import type { WatchlistFilters } from "../types/backend";
import {
  validateWatchlistMarketplaceSelection,
  type ValidatedWatchlistMarketplaceSelection,
} from "../watchlists/validation";
import type { ProductEventInput } from "../analytics/events";
import {
  createEnvironmentExchangeRateProvider,
  type ExchangeRate,
  type ExchangeRateProvider,
} from "../pricing/currency";
import {
  DEFAULT_SHOPPING_PREFERENCES,
  normalizeShoppingPreferences,
  type ShoppingPreferences,
} from "../preferences/shopping";
import {
  calculateProfessionalEconomics,
  type ProfessionalEconomicsResult,
} from "../sourcing/profit-economics";
import { identifyProductCapture } from "../product-capture/identify";
import {
  createProductCaptureResolver,
  type ProductCaptureResolver,
} from "../product-capture/resolve";
import { ApiError, ApiNotFoundError, ApiProRequiredError, ApiValidationError } from "./errors";
import { EMPTY_PRO_ENTITLEMENT } from "./pro";
import { encodeApiCursor } from "./pagination";
import type {
  MatchQueryOptions,
  MobileApiRepositoryContract,
  StoredMatch,
  StoredWorkspace,
} from "./mobile-repository";
import { toApiListing } from "./types";
import type {
  ApiMarketplace,
  ApiDealRoom,
  ApiPublicDealRoom,
  ApiPublicDealRoomItem,
  ApiDealRoomActivity,
  ApiDealRoomComment,
  ApiDealRoomInvitation,
  ApiDealRoomMember,
  ApiDealRoomInput,
  ApiDealRoomItem,
  ApiDealRoomItemInput,
  ApiDealRoomItemUpdateInput,
  ApiDealRoomUpdateInput,
  ApiProductCapture,
  ApiProductCaptureInput,
  ApiProEntitlement,
  ApiComparisonManualGroupInput,
  ApiComparisonResult,
  ApiComparisonShortlistInput,
  ApiSupplier,
  ApiSupplierFilters,
  ApiSupplierInput,
  ApiSupplierShortlistHistory,
  ApiSupplierUpdateInput,
  ApiMatch,
  ApiListingProblemReport,
  ListingProblemReportInput,
  ApiNotification,
  ApiNotificationPreferences,
  ApiShoppingPreferences,
  ApiShoppingPreferencesInput,
  ApiListing,
  ApiListingAlternatives,
  ApiSearchResult,
  ApiSourcingListImportInput,
  ApiSourcingListImportResult,
  ApiSourcingList,
  ApiSourcingListInput,
  ApiSourcingListProductInput,
  ApiSourcingListProductUpdateInput,
  ApiSourcingListUpdateInput,
  ApiSourcingPriceHistory,
  ApiSourcingSummary,
  ApiWatchlist,
  ApiWeeklySummary,
  ApiWorkspace,
  ApiWorkspaceInput,
  ApiWorkspaceMember,
  ApiWorkspaceMemberInput,
  ApiSourcingActivity,
  ApiSourcingNote,
  RawApiSourcingList,
  RawApiSourcingListProduct,
  RawApiSupplier,
  RawApiSupplierShortlistHistory,
  RawApiWorkspaceMember,
  RawApiSourcingActivity,
  RawApiSourcingNote,
  RawApiProductCapture,
  RawApiDealRoom,
  RawApiPublicDealRoom,
  RawApiDealRoomActivity,
  RawApiDealRoomComment,
  RawApiDealRoomMember,
  RawApiDealRoomItem,
  RawApiWatchlist,
  RawApiListing,
} from "./types";

export interface MobileApiDependencies {
  adapters: MarketplaceAdapterRegistry;
  repository: MobileApiRepositoryContract;
  logger: {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  coordinator?: MarketplaceSearchCoordinator;
  productCaptureResolver?: ProductCaptureResolver;
  exchangeRateProvider?: ExchangeRateProvider;
}

export interface SearchInput extends MarketplaceSearchCoordinatorRequest {}

export class MobileApiService {
  private readonly coordinator: MarketplaceSearchCoordinator;
  private readonly productCaptureResolver: ProductCaptureResolver;
  private readonly exchangeRateProvider?: ExchangeRateProvider;

  constructor(private readonly dependencies: MobileApiDependencies) {
    this.coordinator =
      dependencies.coordinator ??
      new MarketplaceSearchCoordinator(dependencies.adapters, dependencies.logger);
    this.productCaptureResolver =
      dependencies.productCaptureResolver ??
      createProductCaptureResolver({
        adapters: dependencies.adapters,
        logger: dependencies.logger,
      });
    this.exchangeRateProvider =
      dependencies.exchangeRateProvider ?? createEnvironmentExchangeRateProvider();
  }

  getMarketplaces(): ApiMarketplace[] {
    return getMarketplaceCatalog(this.dependencies.adapters);
  }

  async search(input: SearchInput, userId?: string): Promise<ApiSearchResult> {
    const preferences = await this.loadShoppingPreferences(userId);
    const response = await this.coordinator.search(
      this.applyShoppingPreferences(input, preferences),
    );
    const storedListings = await this.dependencies.repository.persistListings(response.listings);
    const storedListingsByIdentity = new Map(
      storedListings.map((listing) => [
        listingIdentity(listing.marketplace_id, listing.external_id),
        listing,
      ]),
    );

    const rankedListings = this.rankListingsForPreferences(response.listings, preferences);
    return {
      listings: await Promise.all(
        rankedListings.map(async (listing) => {
          const stored = storedListingsByIdentity.get(
            listingIdentity(listing.source, listing.externalId),
          );
          return toApiListing(listing, {
            id: stored?.id ?? null,
            productIdentityData: stored?.product_identity_data,
            ...(await this.getListingPriceOptions(listing, preferences)),
          });
        }),
      ),
      intent: response.intent,
      filteredCount: response.filteredCount,
      sources: response.sources,
      partialFailures: response.partialFailures,
      pagination: {
        nextCursor: response.pagination.nextCursor
          ? encodeApiCursor(response.pagination.nextCursor)
          : null,
        hasMore: response.pagination.hasMore,
      },
      deduplication: response.deduplication,
    };
  }

  async getShoppingPreferences(userId: string): Promise<ApiShoppingPreferences> {
    const getPreferences = this.dependencies.repository.getShoppingPreferences;
    if (!getPreferences) {
      return DEFAULT_SHOPPING_PREFERENCES;
    }

    return normalizeShoppingPreferences(
      await getPreferences.call(this.dependencies.repository, userId),
    );
  }

  async updateShoppingPreferences(
    userId: string,
    input: ApiShoppingPreferencesInput,
  ): Promise<ApiShoppingPreferences> {
    const updatePreferences = this.dependencies.repository.updateShoppingPreferences;
    if (!updatePreferences) {
      throw new ApiError(
        503,
        "preferences_unavailable",
        "Shopping preferences are not available on this server yet.",
      );
    }

    return normalizeShoppingPreferences(
      await updatePreferences.call(this.dependencies.repository, userId, input),
    );
  }

  private async loadShoppingPreferences(userId: string | undefined) {
    return userId ? this.getShoppingPreferences(userId) : null;
  }

  private applyShoppingPreferences(input: SearchInput, preferences: ShoppingPreferences | null) {
    if (
      !preferences ||
      input.sources !== undefined ||
      preferences.preferredMarketplaces.length === 0
    ) {
      return input;
    }

    const enabledSources = new Set(getEnabledMarketplaceSources(this.dependencies.adapters));
    const preferredSources = preferences.preferredMarketplaces.filter((source) =>
      enabledSources.has(source),
    );
    if (preferredSources.length === 0) {
      return input;
    }

    const sources = preferences.willingToBuyInternationally
      ? preferredSources
      : this.keepLocalOrUnknownSources(preferredSources, preferences.country);

    return { ...input, sources: sources.length > 0 ? sources : preferredSources };
  }

  private keepLocalOrUnknownSources(sources: MarketplaceSource[], country: string) {
    const catalog = new Map(
      this.getMarketplaces().map((marketplace) => [marketplace.source, marketplace]),
    );
    const localOrUnknown = sources.filter((source) => {
      const sourceCountry = catalog.get(source)?.capabilities?.country?.toUpperCase();
      return !sourceCountry || sourceCountry === country;
    });
    return localOrUnknown.length > 0 ? localOrUnknown : sources;
  }

  private rankListingsForPreferences(
    listings: MarketplaceListing[],
    preferences: ShoppingPreferences | null,
  ) {
    if (!preferences) {
      return listings;
    }

    const preferredOrder = new Map(
      preferences.preferredMarketplaces.map((source, index) => [source, index]),
    );
    const catalog = new Map(
      this.getMarketplaces().map((marketplace) => [marketplace.source, marketplace]),
    );

    return [...listings].sort((left, right) => {
      const leftPreferred = preferredOrder.get(left.source) ?? Number.MAX_SAFE_INTEGER;
      const rightPreferred = preferredOrder.get(right.source) ?? Number.MAX_SAFE_INTEGER;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
      }

      if (!preferences.willingToBuyInternationally) {
        const leftCountry = catalog.get(left.source)?.capabilities?.country?.toUpperCase();
        const rightCountry = catalog.get(right.source)?.capabilities?.country?.toUpperCase();
        const leftLocality = !leftCountry ? 1 : leftCountry === preferences.country ? 0 : 2;
        const rightLocality = !rightCountry ? 1 : rightCountry === preferences.country ? 0 : 2;
        if (leftLocality !== rightLocality) {
          return leftLocality - rightLocality;
        }
      }

      return 0;
    });
  }

  private async getListingPriceOptions(
    listing: MarketplaceListing | RawApiListing,
    preferences: ShoppingPreferences | null,
  ): Promise<
    Pick<
      ApiListing,
      | "sourcePrice"
      | "sourceCurrency"
      | "convertedPrice"
      | "convertedCurrency"
      | "exchangeRate"
      | "exchangeRateAsOf"
      | "exchangeRateSource"
      | "conversionStatus"
    >
  > {
    const sourcePrice = listing.price;
    const sourceCurrency = listing.currency?.toUpperCase() ?? null;
    if (!preferences) {
      return { sourcePrice, sourceCurrency };
    }

    const convertedCurrency = preferences.preferredCurrency;
    if (sourcePrice === null || !sourceCurrency) {
      return {
        sourcePrice,
        sourceCurrency,
        convertedCurrency,
        conversionStatus: "unavailable",
      };
    }

    if (sourceCurrency === convertedCurrency) {
      return {
        sourcePrice,
        sourceCurrency,
        convertedPrice: sourcePrice,
        convertedCurrency,
        exchangeRate: 1,
        exchangeRateAsOf: null,
        exchangeRateSource: "same_currency",
        conversionStatus: "not_needed",
      };
    }

    if (!/^[A-Z]{3}$/.test(sourceCurrency) || !this.exchangeRateProvider) {
      return {
        sourcePrice,
        sourceCurrency,
        convertedCurrency,
        conversionStatus: !/^[A-Z]{3}$/.test(sourceCurrency) ? "unsupported" : "unavailable",
      };
    }

    const rate = await this.exchangeRateProvider.getRate(sourceCurrency, convertedCurrency);
    if (!rate) {
      return {
        sourcePrice,
        sourceCurrency,
        convertedCurrency,
        conversionStatus: "unavailable",
      };
    }

    return {
      sourcePrice,
      sourceCurrency,
      convertedPrice: Math.round(sourcePrice * rate.rate * 100) / 100,
      convertedCurrency,
      exchangeRate: rate.rate,
      exchangeRateAsOf: rate.observedAt,
      exchangeRateSource: rate.source,
      conversionStatus: "converted",
    };
  }

  async getListing(userId: string, listingId: string) {
    const result = await this.dependencies.repository.getListingForUser(userId, listingId);
    if (!result) {
      throw new ApiNotFoundError("The listing was not found.");
    }

    const preferences = await this.loadShoppingPreferences(userId);
    const listing = toApiListing(result.listing, {
      id: result.listing.id,
      matchedAt: result.matchedAt,
      isFavorite: result.isFavorite,
      priceHistory: result.priceHistory,
      priceTarget: result.priceTarget,
      ...(await this.getListingPriceOptions(result.listing, preferences)),
    });

    return {
      ...listing,
      recommendation: buildListingRecommendation(listing, [], undefined, preferences),
    };
  }

  async getListingAlternatives(userId: string, listingId: string): Promise<ApiListingAlternatives> {
    const result = await this.dependencies.repository.getListingForUser(userId, listingId);
    if (!result) {
      throw new ApiNotFoundError("The listing was not found.");
    }

    const preferences = await this.loadShoppingPreferences(userId);
    const listing = toApiListing(result.listing, {
      id: result.listing.id,
      matchedAt: result.matchedAt,
      isFavorite: result.isFavorite,
      priceHistory: result.priceHistory,
      priceTarget: result.priceTarget,
      ...(await this.getListingPriceOptions(result.listing, preferences)),
    });
    const currentListing = toMarketplaceListingForComparison(result.listing, listing);
    const sources = getEnabledMarketplaceSources(this.dependencies.adapters).filter(
      (source) => source !== currentListing.source,
    );
    const searchQuery = alternativeSearchQuery(listing);
    const filters = alternativeSearchFilters(listing);
    const productIdentifiers = alternativeProductIdentifiers(listing);

    if (sources.length === 0) {
      return {
        currentOfferId: listingIdentity(currentListing.source, currentListing.externalId),
        currentSource: currentListing.source,
        searchQuery,
        matchMethod: null,
        confidence: null,
        alternatives: [],
        sources: [],
        partialFailures: [],
        recommendation: buildListingRecommendation(listing, [], undefined, preferences),
      };
    }

    const response = await this.coordinator.search(
      {
        searchQuery,
        sources,
        filters,
        ...(productIdentifiers.length > 0 ? { productIdentifiers } : {}),
        pagination: { limit: 100 },
      },
      { preserveAlternatives: true },
    );
    const storedListings = await this.dependencies.repository.persistListings(response.listings);
    const listingIds = new Map(
      storedListings.map((stored) => [
        listingIdentity(stored.marketplace_id, stored.external_id),
        stored.id,
      ]),
    );
    listingIds.set(
      listingIdentity(currentListing.source, currentListing.externalId),
      result.listing.id,
    );

    const storedIdentityByListing = new Map(
      storedListings.map((stored) => [
        listingIdentity(stored.marketplace_id, stored.external_id),
        stored.product_identity_data,
      ]),
    );
    const comparisonListings = [
      currentListing,
      ...response.listings.map((alternative) => {
        const productIdentity = storedIdentityByListing.get(
          listingIdentity(alternative.source, alternative.externalId),
        );
        return productIdentity
          ? {
              ...alternative,
              metadata: { ...alternative.metadata, productIdentity },
            }
          : alternative;
      }),
    ];
    const criteria = emptyComparisonCriteria();
    const exchangeRates = await this.loadComparisonExchangeRates(
      comparisonListings,
      criteria,
      preferences,
    );
    const comparison = buildMarketplaceComparison(comparisonListings, criteria, {
      listingIds,
      allowConditionDifferences: true,
      targetCurrency: preferences?.preferredCurrency,
      exchangeRates,
    });
    const currentOfferId = listingIdentity(currentListing.source, currentListing.externalId);
    const group = comparison.comparisons.find((candidate) =>
      candidate.offers.some((offer) => offer.offerId === currentOfferId),
    );
    const currentOffer = group?.offers.find((offer) => offer.offerId === currentOfferId) ?? null;
    const alternatives =
      group && currentOffer
        ? rankMarketplaceAlternatives({
            group,
            currentOffer,
            preferences,
            marketplaceCountries: new Map(
              this.getMarketplaces().map((marketplace) => [
                marketplace.source,
                marketplace.capabilities?.country ?? null,
              ]),
            ),
          })
        : [];

    return {
      currentOfferId,
      currentSource: currentListing.source,
      searchQuery,
      matchMethod: alternatives.length > 0 ? (group?.matchMethod ?? null) : null,
      confidence: alternatives.length > 0 ? (group?.confidence ?? null) : null,
      alternatives,
      sources: response.sources,
      partialFailures: response.partialFailures,
      recommendation: buildListingRecommendation(
        listing,
        group?.offers.map(toRecommendationOffer) ?? [],
        currentOffer ? toRecommendationOffer(currentOffer) : undefined,
        preferences,
      ),
    };
  }

  async setListingFavorite(userId: string, listingId: string, isFavorite: boolean) {
    const updated = await this.dependencies.repository.setListingFavorite(
      userId,
      listingId,
      isFavorite,
    );
    if (!updated) {
      throw new ApiNotFoundError("The listing was not found.");
    }
  }

  async recordProductEvent(userId: string, input: ProductEventInput) {
    await this.dependencies.repository.recordProductEvent(userId, input);
  }

  async createProductCapture(
    userId: string,
    input: ApiProductCaptureInput,
  ): Promise<ApiProductCapture> {
    const repository = this.dependencies.repository;
    if (!repository.createProductCapture || !repository.updateProductCapture) {
      throw new ApiError(
        503,
        "capture_unavailable",
        "Product capture is not available on this server yet.",
      );
    }

    const created = await repository.createProductCapture.call(repository, userId, input);

    try {
      const identification = await this.productCaptureResolver.resolve(
        input,
        identifyProductCapture(input),
      );
      const updated = await repository.updateProductCapture.call(repository, userId, created.id, {
        ...identification,
        processedAt: new Date().toISOString(),
      });

      if (!updated) {
        throw new ApiNotFoundError("The product capture could not be updated.");
      }

      this.dependencies.logger.info("Product capture processed", {
        captureId: created.id,
        captureSource: input.captureSource,
        status: identification.status,
      });
      return toApiProductCapture(updated);
    } catch (error) {
      const failed = await this.finalizeProductCaptureFailure(userId, created.id, input, error);
      if (failed) {
        return toApiProductCapture(failed);
      }

      throw error;
    }
  }

  async getProductCapture(userId: string, captureId: string): Promise<ApiProductCapture> {
    const getCapture = this.dependencies.repository.getProductCapture;
    if (!getCapture) {
      throw new ApiError(
        503,
        "capture_unavailable",
        "Product capture is not available on this server yet.",
      );
    }

    const capture = await getCapture.call(this.dependencies.repository, userId, captureId);
    if (!capture) {
      throw new ApiNotFoundError("The product capture was not found.");
    }

    return toApiProductCapture(capture);
  }

  private async finalizeProductCaptureFailure(
    userId: string,
    captureId: string,
    input: ApiProductCaptureInput,
    error: unknown,
  ): Promise<RawApiProductCapture | null> {
    this.dependencies.logger.error("Product capture processing failed", {
      captureId,
      captureSource: input.captureSource,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    const updateCapture = this.dependencies.repository.updateProductCapture;
    if (!updateCapture) {
      return null;
    }

    try {
      return await updateCapture.call(this.dependencies.repository, userId, captureId, {
        status: "failed",
        normalizedProduct: null,
        candidateProducts: [],
        missingFields: [],
        failureReason: "The product capture could not be processed.",
        processedAt: new Date().toISOString(),
      });
    } catch (finalizationError) {
      this.dependencies.logger.error("Product capture failure state could not be saved", {
        captureId,
        captureSource: input.captureSource,
        error: finalizationError instanceof Error ? finalizationError.message : "unknown_error",
      });
      return null;
    }
  }

  async createListingProblemReport(
    userId: string,
    requestId: string,
    input: ListingProblemReportInput,
  ): Promise<ApiListingProblemReport> {
    const reportId = await this.dependencies.repository.createListingProblemReport(
      userId,
      requestId,
      input,
    );
    if (!reportId) {
      throw new ApiNotFoundError("The listing or report context was not found.");
    }

    return { reportId, status: "received" };
  }

  getWeeklySummary(userId: string): Promise<ApiWeeklySummary> {
    return this.dependencies.repository.getWeeklySummary(userId);
  }

  async getWorkspaces(userId: string): Promise<ApiWorkspace[]> {
    const workspaces = await this.dependencies.repository.getWorkspaces(userId);
    return workspaces.map(toWorkspace);
  }

  async getProEntitlement(userId: string, workspaceId?: string): Promise<ApiProEntitlement> {
    const entitlement = this.dependencies.repository.getProEntitlement;
    if (!entitlement) {
      return EMPTY_PRO_ENTITLEMENT;
    }

    return entitlement.call(this.dependencies.repository, userId, workspaceId);
  }

  async requireProAccess(userId: string, workspaceId?: string) {
    if (!this.dependencies.repository.getProEntitlement) {
      // Keeps lightweight repository fakes and older deployments compatible while
      // the entitlement migration is rolled out. The production repository
      // always implements this check before returning workspace data.
      return;
    }

    const entitlement = await this.getProEntitlement(userId, workspaceId);
    if (!entitlement.isPro) {
      throw new ApiProRequiredError();
    }
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<ApiWorkspace> {
    const workspace = await this.dependencies.repository.getWorkspace(userId, workspaceId);
    if (!workspace) {
      throw new ApiNotFoundError("The workspace was not found.");
    }

    return toWorkspace(workspace);
  }

  async createWorkspace(userId: string, input: ApiWorkspaceInput): Promise<ApiWorkspace> {
    const workspace = await this.dependencies.repository.createWorkspace(userId, input);
    return toWorkspace(workspace);
  }

  async getWorkspaceMembers(userId: string, workspaceId: string): Promise<ApiWorkspaceMember[]> {
    return (await this.dependencies.repository.getWorkspaceMembers(userId, workspaceId)).map(
      toWorkspaceMember,
    );
  }

  async inviteWorkspaceMember(
    userId: string,
    workspaceId: string,
    input: ApiWorkspaceMemberInput,
  ): Promise<ApiWorkspaceMember> {
    const member = await this.dependencies.repository.inviteWorkspaceMember(
      userId,
      workspaceId,
      input,
    );
    if (!member) {
      throw new ApiNotFoundError(
        "The workspace was not found, you are not the owner, or the user has not created a DealDrop account.",
      );
    }
    return toWorkspaceMember(member);
  }

  async getSourcingLists(
    userId: string,
    workspaceId: string,
    cursor: string | null,
    limit: number,
  ) {
    const page = await this.sourcingListRepository().getSourcingLists(
      userId,
      workspaceId,
      cursor,
      limit,
    );
    return {
      items: page.items.map(toSourcingList),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async getSourcingList(userId: string, workspaceId: string, sourcingListId: string) {
    const list = await this.sourcingListRepository().getSourcingList(
      userId,
      workspaceId,
      sourcingListId,
    );
    if (!list) {
      throw new ApiNotFoundError("The sourcing list was not found.");
    }
    return toSourcingList(list);
  }

  async getSourcingSummary(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<ApiSourcingSummary> {
    const repository = this.dependencies.repository;
    if (!repository.getSourcingSummary) {
      throw new ApiError(503, "api_unavailable", "Sourcing summaries are not configured.");
    }
    const summary = await repository.getSourcingSummary(userId, workspaceId, sourcingListId);
    if (!summary) throw new ApiNotFoundError("The sourcing list was not found.");
    return summary;
  }

  async createSourcingList(userId: string, workspaceId: string, input: ApiSourcingListInput) {
    const normalized = {
      ...input,
      products: input.products.map((product) => this.normalizeSourcingProduct(product)),
    };
    const list = await this.sourcingListRepository().createSourcingList(
      userId,
      workspaceId,
      normalized,
    );
    if (!list) {
      throw new ApiNotFoundError("The workspace was not found or cannot be edited.");
    }
    return toSourcingList(list);
  }

  async updateSourcingList(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListUpdateInput,
  ) {
    const list = await this.sourcingListRepository().updateSourcingList(
      userId,
      workspaceId,
      sourcingListId,
      input,
    );
    if (!list) {
      throw new ApiNotFoundError("The sourcing list was not found or cannot be edited.");
    }
    return toSourcingList(list);
  }

  async duplicateSourcingList(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    name?: string,
  ) {
    const list = await this.sourcingListRepository().duplicateSourcingList(
      userId,
      workspaceId,
      sourcingListId,
      name,
    );
    if (!list) {
      throw new ApiNotFoundError("The sourcing list was not found or cannot be duplicated.");
    }
    return toSourcingList(list);
  }

  async importSourcingListProducts(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListImportInput,
  ): Promise<ApiSourcingListImportResult> {
    const normalized = {
      ...input,
      products: input.products.map((product) => this.normalizeSourcingProduct(product)),
    };
    const result = await this.sourcingListRepository().importSourcingListProducts(
      userId,
      workspaceId,
      sourcingListId,
      normalized,
    );
    if (!result) {
      throw new ApiNotFoundError("The sourcing list was not found or cannot be edited.");
    }

    return {
      list: toSourcingList(result.list),
      importedCount: result.imported_count,
      duplicateImport: result.duplicate_import,
    };
  }

  async addSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    input: ApiSourcingListProductInput,
  ) {
    const list = await this.sourcingListRepository().addSourcingListProduct(
      userId,
      workspaceId,
      sourcingListId,
      this.normalizeSourcingProduct(input),
    );
    if (!list) {
      throw new ApiNotFoundError("The sourcing list was not found or cannot be edited.");
    }
    return toSourcingList(list);
  }

  async updateSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
    input: ApiSourcingListProductUpdateInput,
  ) {
    const normalized = input.marketplaceIds
      ? { ...input, marketplaceIds: this.validateSourcingMarketplaces(input.marketplaceIds) }
      : input;
    const list = await this.sourcingListRepository().updateSourcingListProduct(
      userId,
      workspaceId,
      sourcingListId,
      productId,
      normalized,
    );
    if (!list) {
      throw new ApiNotFoundError("The sourcing list product was not found or cannot be edited.");
    }
    return toSourcingList(list);
  }

  async deleteSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
  ) {
    const deleted = await this.sourcingListRepository().deleteSourcingListProduct(
      userId,
      workspaceId,
      sourcingListId,
      productId,
    );
    if (!deleted) {
      throw new ApiNotFoundError("The sourcing list product was not found or cannot be deleted.");
    }
  }

  async getSourcingNotes(
    userId: string,
    workspaceId: string,
    productId: string,
    shortlistId?: string,
  ): Promise<ApiSourcingNote[]> {
    const repository = this.dependencies.repository;
    if (!repository.getSourcingNotes) {
      throw new ApiError(503, "api_unavailable", "Sourcing notes are not configured.");
    }
    const notes = await repository.getSourcingNotes(userId, workspaceId, productId, shortlistId);
    if (!notes) throw new ApiNotFoundError("The sourcing product was not found.");
    return notes.map(toSourcingNote);
  }

  async createSourcingNote(
    userId: string,
    workspaceId: string,
    input: {
      sourcingListProductId?: string | null;
      comparisonShortlistId?: string | null;
      body: string;
    },
  ): Promise<ApiSourcingNote> {
    const repository = this.dependencies.repository;
    if (!repository.createSourcingNote) {
      throw new ApiError(503, "api_unavailable", "Sourcing notes are not configured.");
    }
    const note = await repository.createSourcingNote(userId, workspaceId, input);
    if (!note) throw new ApiNotFoundError("The workspace was not found or cannot be edited.");
    return toSourcingNote(note);
  }

  async getSourcingActivity(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
  ): Promise<ApiSourcingActivity[]> {
    const repository = this.dependencies.repository;
    if (!repository.getSourcingActivity) {
      throw new ApiError(503, "api_unavailable", "Sourcing activity is not configured.");
    }
    const activity = await repository.getSourcingActivity(userId, workspaceId, sourcingListId);
    if (!activity) throw new ApiNotFoundError("The sourcing list was not found.");
    return activity.map(toSourcingActivity);
  }

  async getSourcingProductPriceHistory(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    productId: string,
  ): Promise<ApiSourcingPriceHistory> {
    const repository = this.sourcingListRepository();
    if (!repository.getSourcingProductPriceHistory) {
      throw new ApiError(503, "api_unavailable", "Sourcing price history is not configured.");
    }
    const history = await repository.getSourcingProductPriceHistory(
      userId,
      workspaceId,
      sourcingListId,
      productId,
    );
    if (!history) {
      throw new ApiNotFoundError("The sourcing product was not found in this workspace.");
    }
    return history;
  }

  async compareSourcingListProduct(
    userId: string,
    workspaceId: string,
    sourcingListId: string,
    sourcingListProductId: string,
  ): Promise<ApiComparisonResult> {
    const list = await this.sourcingListRepository().getSourcingList(
      userId,
      workspaceId,
      sourcingListId,
    );
    const product = list?.products.find((item) => item.id === sourcingListProductId);
    if (!list || !product) {
      throw new ApiNotFoundError("The sourcing product was not found in this workspace.");
    }

    const sources = this.validateSourcingMarketplaces(
      product.sourcing_list_product_marketplaces?.map((item) => item.marketplace_id) ?? [],
    );
    const searchQuery = [product.product_name, ...product.keywords]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
    const productIdentifiers = buildComparisonIdentifiers(product);
    const response = await this.coordinator.search(
      {
        searchQuery,
        sources,
        filters: {},
        ...(productIdentifiers.length > 0 ? { productIdentifiers } : {}),
        pagination: { limit: 100 },
      },
      { preserveAlternatives: true },
    );
    const storedListings = await this.dependencies.repository.persistListings(response.listings);
    const listingIds = new Map(
      storedListings.map((listing) => [
        `${listing.marketplace_id}:${listing.external_id}`,
        listing.id,
      ]),
    );
    const comparisonState = await this.comparisonRepository().getComparisonState(
      userId,
      workspaceId,
      sourcingListProductId,
    );
    if (!comparisonState) {
      throw new ApiNotFoundError("The comparison workspace was not found.");
    }
    const sourcingPriceHistory = this.dependencies.repository.getSourcingProductPriceHistory
      ? await this.dependencies.repository.getSourcingProductPriceHistory(
          userId,
          workspaceId,
          sourcingListId,
          sourcingListProductId,
        )
      : null;
    const suppliers = this.dependencies.repository.getSuppliers
      ? await this.dependencies.repository.getSuppliers(userId, workspaceId)
      : [];
    const comparisonCriteria = toComparisonCriteria(product);
    const shoppingPreferences = await this.loadShoppingPreferences(userId);
    const exchangeRates = await this.loadComparisonExchangeRates(
      response.listings,
      comparisonCriteria,
      shoppingPreferences,
    );

    const comparison = buildMarketplaceComparison(response.listings, comparisonCriteria, {
      listingIds,
      targetCurrency: shoppingPreferences?.preferredCurrency,
      exchangeRates,
      shortlistedKeys: new Set(
        comparisonState.shortlists.map((item) => `${item.marketplace_id}:${item.external_id}`),
      ),
      manualGroups: comparisonState.manualGroups.map<ComparisonManualGroup>((group) => ({
        id: group.id,
        members: group.member_refs,
      })),
    });

    const apiSourcingProduct = toSourcingList(list).products.find(
      (item) => item.id === sourcingListProductId,
    )!;
    const comparisons = comparison.comparisons.map((group) => {
      const offers = group.offers.map((offer) => ({
        ...offer,
        savedSupplier: findSavedSupplier(offer, suppliers),
      }));
      const selectedOffer = selectRecommendationOffer(group, offers);
      const professionalEconomics = selectedOffer
        ? calculateSourcingProfessionalEconomics(product, selectedOffer)
        : null;
      return {
        ...group,
        offers,
        professionalEconomics,
        recommendation: buildSourcingComparisonRecommendation(
          group,
          offers,
          product,
          sourcingPriceHistory,
          shoppingPreferences,
          professionalEconomics,
        ),
      };
    });

    return {
      sourcingListProduct: apiSourcingProduct,
      searchQuery,
      comparisons,
      sources,
      partialFailures: response.partialFailures,
      shortlisted: comparisonState.shortlists.map(toApiComparisonShortlist),
      manualGroups: comparisonState.manualGroups.map(toApiComparisonManualGroup),
    };
  }

  private async loadComparisonExchangeRates(
    listings: MarketplaceListing[],
    criteria: ComparisonCriteria,
    preferences: ShoppingPreferences | null,
  ) {
    if (!preferences || !this.exchangeRateProvider) return undefined;

    const currencies = new Set<string>();
    for (const listing of listings) {
      addCurrency(currencies, listing.currency);
      for (const component of Object.values(listing.cost ?? {})) {
        if (component) addCurrency(currencies, component.currency);
      }
    }
    addCurrency(currencies, criteria.maxUnitCostCurrency);
    addCurrency(currencies, criteria.estimatedShippingCurrency);
    addCurrency(currencies, criteria.estimatedDutiesTaxesCurrency);
    addCurrency(currencies, criteria.otherSourcingCostCurrency);
    currencies.delete(preferences.preferredCurrency);

    const rates = new Map<string, ExchangeRate>();
    await Promise.all(
      [...currencies].map(async (currency) => {
        try {
          const rate = await this.exchangeRateProvider!.getRate(
            currency,
            preferences.preferredCurrency,
          );
          if (rate) rates.set(`${currency}:${preferences.preferredCurrency}`, rate);
        } catch (error) {
          this.dependencies.logger.warn("Comparison currency conversion failed", {
            currency,
            targetCurrency: preferences.preferredCurrency,
            error: error instanceof Error ? error.message : "unknown_error",
          });
        }
      }),
    );
    return rates;
  }

  async getSuppliers(userId: string, workspaceId: string, filters: ApiSupplierFilters = {}) {
    const repository = this.supplierRepository();
    const suppliers = await repository.getSuppliers(userId, workspaceId, filters);
    return suppliers.map(toApiSupplier);
  }

  async createSupplier(userId: string, workspaceId: string, input: ApiSupplierInput) {
    const supplier = await this.supplierRepository().createSupplier(userId, workspaceId, input);
    if (!supplier) {
      throw new ApiNotFoundError("The workspace was not found or cannot be edited.");
    }
    return toApiSupplier(supplier);
  }

  async updateSupplier(
    userId: string,
    workspaceId: string,
    supplierId: string,
    input: ApiSupplierUpdateInput,
  ) {
    const supplier = await this.supplierRepository().updateSupplier(
      userId,
      workspaceId,
      supplierId,
      input,
    );
    if (!supplier) {
      throw new ApiNotFoundError("The supplier was not found in this workspace.");
    }
    return toApiSupplier(supplier);
  }

  async deleteSupplier(userId: string, workspaceId: string, supplierId: string) {
    const deleted = await this.supplierRepository().deleteSupplier(userId, workspaceId, supplierId);
    if (!deleted) {
      throw new ApiNotFoundError("The supplier was not found in this workspace.");
    }
  }

  async getSupplierShortlistHistory(userId: string, workspaceId: string, supplierId: string) {
    const history = await this.supplierRepository().getSupplierShortlistHistory(
      userId,
      workspaceId,
      supplierId,
    );
    if (!history) {
      throw new ApiNotFoundError("The supplier was not found in this workspace.");
    }
    return history.map(toApiSupplierShortlistHistory);
  }

  async shortlistComparisonOffer(
    userId: string,
    workspaceId: string,
    input: ApiComparisonShortlistInput,
  ) {
    const shortlist = await this.comparisonRepository().upsertComparisonShortlist(
      userId,
      workspaceId,
      input,
    );
    if (!shortlist) {
      throw new ApiNotFoundError("The comparison offer was not found in this workspace.");
    }
    return toApiComparisonShortlist(shortlist);
  }

  async deleteComparisonShortlist(userId: string, workspaceId: string, shortlistId: string) {
    const deleted = await this.comparisonRepository().deleteComparisonShortlist(
      userId,
      workspaceId,
      shortlistId,
    );
    if (!deleted) {
      throw new ApiNotFoundError("The comparison shortlist was not found.");
    }
  }

  async createComparisonManualGroup(
    userId: string,
    workspaceId: string,
    input: ApiComparisonManualGroupInput,
  ) {
    const group = await this.comparisonRepository().createComparisonManualGroup(
      userId,
      workspaceId,
      input,
    );
    if (!group) {
      throw new ApiNotFoundError("The sourcing product was not found in this workspace.");
    }
    return toApiComparisonManualGroup(group);
  }

  async deleteComparisonManualGroup(userId: string, workspaceId: string, groupId: string) {
    const deleted = await this.comparisonRepository().deleteComparisonManualGroup(
      userId,
      workspaceId,
      groupId,
    );
    if (!deleted) {
      throw new ApiNotFoundError("The manual comparison group was not found.");
    }
  }

  async getDealRooms(userId: string) {
    return (await this.dependencies.repository.getDealRooms(userId)).map(toDealRoom);
  }

  async getDealRoom(userId: string, roomId: string) {
    const room = await this.dependencies.repository.getDealRoom(userId, roomId);
    if (!room) {
      throw new ApiNotFoundError("The Deal Room was not found.");
    }

    return toDealRoom(room);
  }

  async getPublicDealRoom(roomId: string) {
    const room = await this.dependencies.repository.getPublicDealRoom(roomId);
    if (!room) {
      throw new ApiNotFoundError("The public Deal Room was not found.");
    }

    return toPublicDealRoom(room);
  }

  async createDealRoom(userId: string, input: ApiDealRoomInput) {
    return toDealRoom(await this.dependencies.repository.createDealRoom(userId, input));
  }

  async updateDealRoom(userId: string, roomId: string, input: ApiDealRoomUpdateInput) {
    const room = await this.dependencies.repository.updateDealRoom(userId, roomId, input);
    if (!room) {
      throw new ApiNotFoundError("The Deal Room was not found or cannot be edited.");
    }

    return toDealRoom(room);
  }

  async deleteDealRoom(userId: string, roomId: string) {
    const deleted = await this.dependencies.repository.deleteDealRoom(userId, roomId);
    if (!deleted) {
      throw new ApiNotFoundError("The Deal Room was not found.");
    }
  }

  async addDealRoomItem(userId: string, roomId: string, input: ApiDealRoomItemInput) {
    const item = await this.dependencies.repository.addDealRoomItem(userId, roomId, input);
    if (!item) {
      throw new ApiNotFoundError(
        "The Deal Room was not found, or the selected product is not available to this account.",
      );
    }

    return toDealRoomItem(item);
  }

  async updateDealRoomItem(
    userId: string,
    roomId: string,
    itemId: string,
    input: ApiDealRoomItemUpdateInput,
  ) {
    const item = await this.dependencies.repository.updateDealRoomItem(
      userId,
      roomId,
      itemId,
      input,
    );
    if (!item) {
      throw new ApiNotFoundError("The Deal Room item was not found or cannot be edited.");
    }

    return toDealRoomItem(item);
  }

  async deleteDealRoomItem(userId: string, roomId: string, itemId: string) {
    const deleted = await this.dependencies.repository.deleteDealRoomItem(userId, roomId, itemId);
    if (!deleted) {
      throw new ApiNotFoundError("The Deal Room item was not found.");
    }
  }

  async getDealRoomMembers(userId: string, roomId: string): Promise<ApiDealRoomMember[]> {
    const members = await this.dependencies.repository.getDealRoomMembers(userId, roomId);
    return members.map(toDealRoomMember);
  }

  async createDealRoomInvitation(
    userId: string,
    roomId: string,
    input: { email: string; role: "contributor" | "viewer" },
  ): Promise<ApiDealRoomInvitation> {
    const invitation = await this.dependencies.repository.createDealRoomInvitation(
      userId,
      roomId,
      input,
    );
    if (!invitation) {
      throw new ApiNotFoundError("The Deal Room was not found or you cannot invite members.");
    }
    return invitation;
  }

  async acceptDealRoomInvitation(userId: string, token: string) {
    const room = await this.dependencies.repository.acceptDealRoomInvitation(userId, token);
    if (!room) {
      throw new ApiNotFoundError(
        "This invitation is invalid, expired, or addressed to a different DealDrop account.",
      );
    }
    return toDealRoom(room);
  }

  async getDealRoomComments(
    userId: string,
    roomId: string,
    itemId: string,
  ): Promise<ApiDealRoomComment[]> {
    return (await this.dependencies.repository.getDealRoomComments(userId, roomId, itemId)).map(
      toDealRoomComment,
    );
  }

  async createDealRoomComment(
    userId: string,
    roomId: string,
    itemId: string,
    body: string,
  ): Promise<ApiDealRoomComment> {
    const comment = await this.dependencies.repository.createDealRoomComment(
      userId,
      roomId,
      itemId,
      body,
    );
    if (!comment) {
      throw new ApiNotFoundError("The Deal Room item was not found or you cannot comment here.");
    }
    return toDealRoomComment(comment);
  }

  async deleteDealRoomComment(userId: string, roomId: string, commentId: string) {
    const deleted = await this.dependencies.repository.deleteDealRoomComment(
      userId,
      roomId,
      commentId,
    );
    if (!deleted) {
      throw new ApiNotFoundError("The comment was not found or cannot be removed.");
    }
  }

  async setDealRoomItemVote(userId: string, roomId: string, itemId: string, prefer: boolean) {
    const updated = await this.dependencies.repository.setDealRoomItemVote(
      userId,
      roomId,
      itemId,
      prefer,
    );
    if (!updated) {
      throw new ApiNotFoundError("The Deal Room item was not found or you cannot vote here.");
    }
  }

  async getDealRoomActivity(userId: string, roomId: string): Promise<ApiDealRoomActivity[]> {
    return (await this.dependencies.repository.getDealRoomActivity(userId, roomId)).map(
      toDealRoomActivity,
    );
  }

  async getWatchlists(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getWatchlists(userId, cursor, limit);
    return {
      items: page.items.map(toWatchlist),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async getWatchlist(userId: string, watchlistId: string) {
    const watchlist = await this.dependencies.repository.getWatchlist(userId, watchlistId);
    if (!watchlist) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }

    return toWatchlist(watchlist);
  }

  async createWatchlist(
    userId: string,
    input: {
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      alertMode: "instant" | "digest";
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope?: "selected" | "all";
      marketplaceIds?: string[];
    },
  ) {
    const selection = this.validateSelection(input.marketplaceScope, input.marketplaceIds);
    const watchlist = await this.dependencies.repository.createWatchlist(userId, {
      ...input,
      filters: input.filters,
      marketplaceScope: selection.scope,
      marketplaceIds: selection.marketplaceIds,
    });

    return toWatchlist(watchlist);
  }

  async updateWatchlist(
    userId: string,
    watchlistId: string,
    input: Partial<{
      name: string;
      searchQuery: string;
      filters: WatchlistFilters;
      alertMode: "instant" | "digest";
      isActive: boolean;
      isFavorite: boolean;
      marketplaceScope: "selected" | "all";
      marketplaceIds: string[];
      lifecycleState?: "active" | "paused" | "snoozed" | "completed";
      snoozedUntil?: string | null;
    }>,
  ) {
    let normalizedInput = input;
    if (input.marketplaceScope !== undefined || input.marketplaceIds !== undefined) {
      const current = await this.dependencies.repository.getWatchlist(userId, watchlistId);
      if (!current) {
        throw new ApiNotFoundError("The watchlist was not found.");
      }

      const selection = this.validateSelection(
        input.marketplaceScope ?? current.marketplace_scope,
        input.marketplaceIds ??
          current.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [
            current.marketplace_id,
          ],
      );
      normalizedInput = {
        ...input,
        marketplaceScope: selection.scope,
        marketplaceIds: selection.marketplaceIds,
      };
    }

    const watchlist = await this.dependencies.repository.updateWatchlist(
      userId,
      watchlistId,
      normalizedInput,
    );
    if (!watchlist) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }

    return toWatchlist(watchlist);
  }

  async deleteWatchlist(userId: string, watchlistId: string) {
    const deleted = await this.dependencies.repository.deleteWatchlist(userId, watchlistId);
    if (!deleted) {
      throw new ApiNotFoundError("The watchlist was not found.");
    }
  }

  async getMatches(
    userId: string,
    watchlistId: string | null,
    cursor: string | null,
    limit: number,
    includeDismissed = false,
    options: MatchQueryOptions = {},
  ) {
    if (watchlistId) {
      const watchlist = await this.dependencies.repository.getWatchlist(userId, watchlistId);
      if (!watchlist) {
        throw new ApiNotFoundError("The watchlist was not found.");
      }
    }

    const page = await this.dependencies.repository.getMatches(
      userId,
      watchlistId,
      cursor,
      limit,
      includeDismissed,
      options,
    );
    const preferences = await this.loadShoppingPreferences(userId);
    return {
      items: await Promise.all(
        page.items.map(async (match) => {
          const listing = unwrap(match.listing);
          return toMatch(
            match,
            listing ? await this.getListingPriceOptions(listing, preferences) : undefined,
          );
        }),
      ),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async getFavoriteListings(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getFavoriteListings(userId, cursor, limit);
    const preferences = await this.loadShoppingPreferences(userId);
    return {
      items: await Promise.all(
        page.items.map(async (item) =>
          toApiListing(item.listing, {
            id: item.listing.id,
            matchedAt: item.matchedAt,
            isFavorite: true,
            priceHistory: item.priceHistory,
            priceTarget: item.priceTarget,
            ...(await this.getListingPriceOptions(item.listing, preferences)),
          }),
        ),
      ),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async setMatchStatus(userId: string, matchId: string, status: "unread" | "read" | "dismissed") {
    const updated = await this.dependencies.repository.setMatchStatus(userId, matchId, status);
    if (!updated) {
      throw new ApiNotFoundError("The match was not found.");
    }
  }

  async setMatchFeedback(
    userId: string,
    matchId: string,
    feedback: "relevant" | "not_relevant" | null,
  ) {
    const updated = await this.dependencies.repository.setMatchFeedback(userId, matchId, feedback);
    if (!updated) {
      throw new ApiNotFoundError("The match was not found.");
    }
  }

  async getNotifications(userId: string, cursor: string | null, limit: number) {
    const page = await this.dependencies.repository.getNotifications(userId, cursor, limit);
    return {
      items: page.items.map(toNotification),
      pagination: {
        nextCursor: page.nextCursor ? encodeApiCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const found = await this.dependencies.repository.markNotificationRead(userId, notificationId);
    if (!found) {
      throw new ApiNotFoundError("The notification was not found.");
    }
  }

  getNotificationPreferences(userId: string) {
    return this.dependencies.repository.getNotificationPreferences(userId);
  }

  updateNotificationPreferences(userId: string, preferences: ApiNotificationPreferences) {
    return this.dependencies.repository.updateNotificationPreferences(userId, preferences);
  }

  registerPushToken(
    userId: string,
    input: { expoPushToken: string; platform: "ios" | "android" | "web" },
  ) {
    return this.dependencies.repository.registerPushToken(userId, input);
  }

  getEnabledSources() {
    return getEnabledMarketplaceSources(this.dependencies.adapters);
  }

  private sourcingListRepository() {
    const repository = this.dependencies.repository;
    if (
      !repository.getSourcingLists ||
      !repository.getSourcingList ||
      !repository.createSourcingList ||
      !repository.updateSourcingList ||
      !repository.duplicateSourcingList ||
      !repository.importSourcingListProducts ||
      !repository.addSourcingListProduct ||
      !repository.updateSourcingListProduct ||
      !repository.deleteSourcingListProduct
    ) {
      throw new ApiError(503, "api_unavailable", "Sourcing list support is not configured.");
    }

    return {
      getSourcingLists: repository.getSourcingLists.bind(repository),
      getSourcingList: repository.getSourcingList.bind(repository),
      createSourcingList: repository.createSourcingList.bind(repository),
      updateSourcingList: repository.updateSourcingList.bind(repository),
      duplicateSourcingList: repository.duplicateSourcingList.bind(repository),
      importSourcingListProducts: repository.importSourcingListProducts.bind(repository),
      addSourcingListProduct: repository.addSourcingListProduct.bind(repository),
      updateSourcingListProduct: repository.updateSourcingListProduct.bind(repository),
      deleteSourcingListProduct: repository.deleteSourcingListProduct.bind(repository),
      getSourcingProductPriceHistory: repository.getSourcingProductPriceHistory?.bind(repository),
      getSourcingSummary: repository.getSourcingSummary?.bind(repository),
    };
  }

  private comparisonRepository() {
    const repository = this.dependencies.repository;
    if (
      !repository.getComparisonState ||
      !repository.upsertComparisonShortlist ||
      !repository.deleteComparisonShortlist ||
      !repository.createComparisonManualGroup ||
      !repository.deleteComparisonManualGroup
    ) {
      throw new ApiError(503, "api_unavailable", "Comparison support is not configured.");
    }

    return {
      getComparisonState: repository.getComparisonState.bind(repository),
      upsertComparisonShortlist: repository.upsertComparisonShortlist.bind(repository),
      deleteComparisonShortlist: repository.deleteComparisonShortlist.bind(repository),
      createComparisonManualGroup: repository.createComparisonManualGroup.bind(repository),
      deleteComparisonManualGroup: repository.deleteComparisonManualGroup.bind(repository),
    };
  }

  private supplierRepository() {
    const repository = this.dependencies.repository;
    if (
      !repository.getSuppliers ||
      !repository.createSupplier ||
      !repository.updateSupplier ||
      !repository.deleteSupplier ||
      !repository.getSupplierShortlistHistory
    ) {
      throw new ApiError(503, "api_unavailable", "Supplier support is not configured.");
    }

    return {
      getSuppliers: repository.getSuppliers.bind(repository),
      createSupplier: repository.createSupplier.bind(repository),
      updateSupplier: repository.updateSupplier.bind(repository),
      deleteSupplier: repository.deleteSupplier.bind(repository),
      getSupplierShortlistHistory: repository.getSupplierShortlistHistory.bind(repository),
    };
  }

  private normalizeSourcingProduct(input: ApiSourcingListProductInput) {
    return { ...input, marketplaceIds: this.validateSourcingMarketplaces(input.marketplaceIds) };
  }

  private validateSourcingMarketplaces(marketplaceIds: string[]): MarketplaceSource[] {
    try {
      return validateWatchlistMarketplaceSelection(marketplaceIds, this.getEnabledSources())
        .marketplaceIds;
    } catch (error) {
      throw new ApiValidationError(
        error instanceof Error ? error.message : "Marketplace selection is invalid.",
      );
    }
  }

  private validateSelection(
    scope: "selected" | "all" | undefined,
    marketplaceIds: string[] | undefined,
  ): ValidatedWatchlistMarketplaceSelection {
    const availableSources = this.getEnabledSources();
    const defaultSelection =
      marketplaceIds !== undefined || scope !== undefined
        ? { scope: scope ?? "selected", marketplaceIds: marketplaceIds ?? [] }
        : "all";

    try {
      return validateWatchlistMarketplaceSelection(defaultSelection, availableSources);
    } catch (error) {
      throw new ApiValidationError(
        error instanceof Error ? error.message : "Marketplace selection is invalid.",
      );
    }
  }
}

function toWatchlist(watchlist: RawApiWatchlist): ApiWatchlist {
  const marketplaceIds = watchlist.watchlist_marketplaces?.map((item) => item.marketplace_id) ?? [];
  return {
    id: watchlist.id,
    name: watchlist.name,
    searchQuery: watchlist.search_query,
    filters: watchlist.filters,
    alertMode: watchlist.alert_mode,
    marketplaceScope: watchlist.marketplace_scope,
    marketplaceIds:
      watchlist.marketplace_scope === "all"
        ? []
        : marketplaceIds.length
          ? marketplaceIds
          : [watchlist.marketplace_id],
    isActive: watchlist.is_active,
    isFavorite: watchlist.is_favorite,
    lifecycleState: watchlist.lifecycle_state,
    snoozedUntil: watchlist.snoozed_until,
    completedAt: watchlist.completed_at,
    lastCheckedAt: watchlist.last_checked_at,
    createdAt: watchlist.created_at,
    updatedAt: watchlist.updated_at,
  };
}

function toApiProductCapture(capture: RawApiProductCapture): ApiProductCapture {
  return {
    id: capture.id,
    captureSource: capture.capture_source,
    url: capture.url,
    rawText: capture.raw_text,
    barcode: capture.barcode,
    barcodeFormat: capture.barcode_format,
    imageReference: capture.image_reference,
    country: capture.country,
    preferredCurrency: capture.preferred_currency,
    status: capture.status,
    normalizedProduct: capture.normalized_product,
    candidateProducts: capture.candidate_products ?? [],
    missingFields: capture.missing_fields,
    failureReason: capture.failure_reason,
    createdAt: capture.created_at,
    updatedAt: capture.updated_at,
    processedAt: capture.processed_at,
  };
}

function toWorkspace(workspace: StoredWorkspace): ApiWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    businessType: workspace.business_type,
    primarySourcingCategories: workspace.primary_sourcing_categories,
    defaultCurrency: workspace.default_currency,
    countryRegion: workspace.country_region,
    role: workspace.role,
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
  };
}

function toWorkspaceMember(member: RawApiWorkspaceMember): ApiWorkspaceMember {
  return {
    userId: member.user_id,
    email: member.email,
    fullName: member.full_name,
    role: member.role,
    createdAt: member.created_at,
  };
}

function toSourcingNote(note: RawApiSourcingNote): ApiSourcingNote {
  return {
    id: note.id,
    sourcingListProductId: note.sourcing_list_product_id,
    comparisonShortlistId: note.comparison_shortlist_id,
    authorId: note.author_id,
    authorName: note.author?.full_name ?? note.author?.email ?? null,
    body: note.body,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

function toDealRoom(room: RawApiDealRoom): ApiDealRoom {
  return {
    id: room.id,
    publicSlug: room.public_slug,
    name: room.name,
    description: room.description,
    coverImageUrl: room.cover_image_url,
    visibility: room.visibility,
    role: room.role,
    isMember: room.is_member,
    memberCount: room.member_count,
    items: room.items.map(toDealRoomItem),
    createdAt: room.created_at,
    updatedAt: room.updated_at,
  };
}

function toPublicDealRoom(room: RawApiPublicDealRoom): ApiPublicDealRoom {
  return {
    publicSlug: room.public_slug,
    name: room.name,
    description: room.description,
    coverImageUrl: room.cover_image_url,
    ownerDisplayName: room.owner_display_name,
    items: room.items.map(toPublicDealRoomItem),
  };
}

function toPublicDealRoomItem(item: RawApiDealRoomItem): ApiPublicDealRoomItem {
  const publicItem = toDealRoomItem(item);
  return {
    title: publicItem.title,
    imageUrl: publicItem.imageUrl,
    currentPrice: publicItem.currentPrice,
    currency: publicItem.currency,
    availability: publicItem.availability,
    source: publicItem.source,
    url: publicItem.url,
  };
}

function toDealRoomItem(item: RawApiDealRoomItem): ApiDealRoomItem {
  const listing = item.listing ?? item.current_listing ?? null;
  const title = listing?.title ?? item.product_identity?.canonical_title ?? item.watchlist?.name;

  return {
    id: item.id,
    roomId: item.room_id,
    itemType: item.item_type,
    productIdentityId: item.product_identity_id,
    listingId: item.listing_id,
    watchlistId: item.watchlist_id,
    title: title ?? item.watchlist?.search_query ?? "Saved DealDrop item",
    imageUrl: listing?.image_url ?? null,
    currentPrice: listing?.price ?? null,
    currency: listing?.currency ?? null,
    availability: listing ? (listing.is_active ? "available" : "unavailable") : "unknown",
    source: listing?.marketplace_id ?? null,
    url: listing?.url ?? null,
    watchlistName: item.watchlist?.name ?? null,
    isShortlisted: item.is_shortlisted,
    voteCount: item.vote_count ?? 0,
    viewerVoted: item.viewer_voted ?? false,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toDealRoomMember(member: RawApiDealRoomMember): ApiDealRoomMember {
  return {
    userId: member.user_id,
    email: member.email,
    fullName: member.full_name,
    role: member.role,
    createdAt: member.created_at,
  };
}

function toDealRoomComment(comment: RawApiDealRoomComment): ApiDealRoomComment {
  return {
    id: comment.id,
    itemId: comment.item_id,
    userId: comment.user_id,
    authorName: comment.author?.full_name ?? comment.author?.email ?? null,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

function toDealRoomActivity(activity: RawApiDealRoomActivity): ApiDealRoomActivity {
  return {
    id: activity.id,
    roomId: activity.room_id,
    itemId: activity.item_id,
    actorId: activity.actor_id,
    actorName: activity.actor?.full_name ?? activity.actor?.email ?? null,
    eventType: activity.event_type,
    metadata: activity.metadata,
    createdAt: activity.created_at,
  };
}

function toSourcingActivity(activity: RawApiSourcingActivity): ApiSourcingActivity {
  return {
    id: activity.id,
    actorId: activity.actor_id,
    actorName: activity.actor?.full_name ?? activity.actor?.email ?? null,
    sourcingListId: activity.sourcing_list_id,
    sourcingListProductId: activity.sourcing_list_product_id,
    eventType: activity.event_type,
    metadata: activity.metadata,
    createdAt: activity.created_at,
  };
}

function toSourcingList(list: RawApiSourcingList): ApiSourcingList {
  const products = list.products.map((product) => ({
    id: product.id,
    category: product.category,
    productName: product.product_name,
    sku: product.sku,
    upc: product.upc,
    gtin: product.gtin,
    mpn: product.mpn,
    keywords: product.keywords,
    targetQuantity: product.target_quantity,
    sourcedQuantity: product.sourced_quantity,
    targetUnitCost: product.target_unit_cost === null ? null : Number(product.target_unit_cost),
    targetUnitCostCurrency: product.target_unit_cost_currency,
    maxUnitCost: product.max_unit_cost === null ? null : Number(product.max_unit_cost),
    maxUnitCostCurrency: product.max_unit_cost_currency,
    estimatedShippingCost:
      product.estimated_shipping_cost === null ? null : Number(product.estimated_shipping_cost),
    estimatedShippingCurrency: product.estimated_shipping_currency,
    estimatedDutiesTaxes:
      product.estimated_duties_taxes === null ? null : Number(product.estimated_duties_taxes),
    estimatedDutiesTaxesCurrency: product.estimated_duties_taxes_currency,
    otherSourcingCost:
      product.other_sourcing_cost === null ? null : Number(product.other_sourcing_cost),
    otherSourcingCostCurrency: product.other_sourcing_cost_currency,
    desiredRetailPrice:
      product.desired_retail_price === null ? null : Number(product.desired_retail_price),
    desiredRetailPriceCurrency: product.desired_retail_price_currency,
    minimumDesiredMarginPercent:
      product.minimum_desired_margin_percent === null
        ? null
        : Number(product.minimum_desired_margin_percent),
    desiredRoiPercent:
      product.desired_roi_percent === null ? null : Number(product.desired_roi_percent),
    estimatedResaleFees:
      product.estimated_resale_fees === null ? null : Number(product.estimated_resale_fees),
    estimatedResaleFeesCurrency: product.estimated_resale_fees_currency,
    maxLandedUnitCost:
      product.max_landed_unit_cost === null ? null : Number(product.max_landed_unit_cost),
    maxLandedUnitCostCurrency: product.max_landed_unit_cost_currency,
    professionalEconomics: calculateSourcingProfessionalEconomics(product),
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
    assignedTo: product.assigned_to,
    workflowStatus: product.workflow_status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  }));
  const targetQuantity = products.reduce((total, product) => total + product.targetQuantity, 0);
  const sourcedQuantity = products.reduce((total, product) => total + product.sourcedQuantity, 0);
  const completedProducts = products.filter(
    (product) => product.sourcedQuantity >= product.targetQuantity,
  ).length;

  return {
    id: list.id,
    workspaceId: list.workspace_id,
    name: list.name,
    status: list.status,
    targetBudget: list.target_budget === null ? null : Number(list.target_budget),
    targetBudgetCurrency: list.target_budget_currency,
    products,
    progress: {
      totalProducts: products.length,
      completedProducts,
      targetQuantity,
      sourcedQuantity,
      percentComplete:
        targetQuantity === 0
          ? 0
          : Math.min(100, Math.round((sourcedQuantity / targetQuantity) * 100)),
    },
    createdAt: list.created_at,
    updatedAt: list.updated_at,
  };
}

function buildComparisonIdentifiers(product: {
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
}): MarketplaceProductIdentifier[] {
  const identifiers: MarketplaceProductIdentifier[] = [];
  if (product.upc) identifiers.push({ type: "upc", value: product.upc });
  if (product.gtin) identifiers.push({ type: "ean", value: product.gtin });
  if (product.mpn) identifiers.push({ type: "part_number", value: product.mpn });
  return identifiers.slice(0, 1);
}

function calculateSourcingProfessionalEconomics(
  product: RawApiSourcingListProduct,
  offer?: MarketplaceComparisonOffer | null,
): ProfessionalEconomicsResult {
  const delivered = offer?.cost?.estimatedDeliveredUnitCost;
  const providedLandedUnitCost =
    delivered ??
    (offer?.landedUnitCost !== null && offer?.landedUnitCostCurrency
      ? { amount: offer.landedUnitCost, currency: offer.landedUnitCostCurrency }
      : null);
  const expectedBuyUnitCost = offer ? offer.price : numericOrNull(product.target_unit_cost);
  const expectedBuyCurrency = offer ? offer.currency : product.target_unit_cost_currency;

  return calculateProfessionalEconomics({
    basis: offer ? "marketplace_offer" : "configured_expected_buy_cost",
    quantity: product.target_quantity,
    expectedBuyUnitCost,
    expectedBuyCurrency,
    providedLandedUnitCost: providedLandedUnitCost?.amount ?? null,
    providedLandedUnitCostCurrency: providedLandedUnitCost?.currency ?? null,
    providedLandedCostCompleteness:
      offer?.cost?.completeness ?? (providedLandedUnitCost ? "complete" : null),
    estimatedShippingCost: numericOrNull(product.estimated_shipping_cost),
    estimatedShippingCurrency: product.estimated_shipping_currency,
    estimatedDutiesTaxes: numericOrNull(product.estimated_duties_taxes),
    estimatedDutiesTaxesCurrency: product.estimated_duties_taxes_currency,
    otherSourcingCost: numericOrNull(product.other_sourcing_cost),
    otherSourcingCostCurrency: product.other_sourcing_cost_currency,
    expectedSalePrice: numericOrNull(product.desired_retail_price),
    expectedSalePriceCurrency: product.desired_retail_price_currency,
    resaleFeesTotal: numericOrNull(product.estimated_resale_fees),
    resaleFeesCurrency: product.estimated_resale_fees_currency,
    desiredRoiPercent: numericOrNull(product.desired_roi_percent),
    desiredMarginPercent: numericOrNull(product.minimum_desired_margin_percent),
  });
}

function toMarketplaceListingForComparison(
  raw: RawApiListing,
  listing: ApiListing,
): MarketplaceListing {
  return {
    source: listing.source,
    externalId: listing.externalId,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    url: listing.url,
    imageUrls: listing.imageUrls,
    sellerName: listing.sellerName,
    location: listing.location,
    category: listing.category,
    condition: listing.condition,
    latitude: listing.latitude,
    longitude: listing.longitude,
    postedAt: listing.listedAt,
    ...(listing.product ? { product: listing.product } : {}),
    ...(listing.qualitySignals ? { qualitySignals: listing.qualitySignals } : {}),
    metadata: {
      ...raw.raw_data,
      ...(raw.product_identity_data ? { productIdentity: raw.product_identity_data } : {}),
      ...(listing.productIdentity ? { productIdentity: listing.productIdentity } : {}),
    },
  };
}

function alternativeSearchQuery(listing: ApiListing) {
  const identity = listing.productIdentity;
  return [identity?.title ?? listing.title, identity?.brand, identity?.model, identity?.variant.raw]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" ")
    .slice(0, 200);
}

function alternativeSearchFilters(listing: ApiListing): WatchlistFilters {
  const identity = listing.productIdentity;
  return {
    productIdentity: identity
      ? {
          title: identity.title ?? listing.title,
          brand: identity.brand ?? undefined,
          model: identity.model ?? undefined,
          identifiers: identity.identifiers,
          variant: identity.variant,
        }
      : {
          title: listing.title,
        },
  };
}

function alternativeProductIdentifiers(listing: ApiListing): MarketplaceProductIdentifier[] {
  const identifiers = listing.productIdentity?.identifiers ?? [];
  return identifiers.flatMap((identifier): MarketplaceProductIdentifier[] => {
    if (
      identifier.type === "upc" ||
      identifier.type === "ean" ||
      identifier.type === "gtin" ||
      identifier.type === "asin"
    ) {
      return [{ type: identifier.type, value: identifier.value }];
    }
    if (identifier.type === "mpn") {
      return [{ type: "part_number" as const, value: identifier.value }];
    }
    return [];
  });
}

function emptyComparisonCriteria(): ComparisonCriteria {
  return {
    targetQuantity: 1,
    maxUnitCost: null,
    maxUnitCostCurrency: null,
    estimatedShippingCost: null,
    estimatedShippingCurrency: null,
    estimatedDutiesTaxes: null,
    estimatedDutiesTaxesCurrency: null,
    otherSourcingCost: null,
    otherSourcingCostCurrency: null,
    maxLandedUnitCost: null,
    maxLandedUnitCostCurrency: null,
    preferredCondition: null,
  };
}

function buildListingRecommendation(
  listing: ApiListing,
  competingOffers: RecommendationOffer[] = [],
  currentOffer?: RecommendationOffer,
  preferences: ShoppingPreferences | null = null,
) {
  return buildProductRecommendation({
    currentOffer: currentOffer ?? listingRecommendationOffer(listing),
    competingOffers,
    ...(currentOffer &&
    currentOffer.deliveredUnitCost !== null &&
    competingOffers.some((offer) => offer.deliveredUnitCost !== null)
      ? { preferredPriceBasis: "delivered_unit_cost" as const }
      : {}),
    history: listing.priceHistory
      ? {
          basis: "marketplace_price",
          status: listing.priceHistory.status,
          observationCount: listing.priceHistory.observationCount,
          lowestPrice: listing.priceHistory.lowestPrice,
          highestPrice: listing.priceHistory.highestPrice,
          medianPrice: listing.priceHistory.medianPrice,
          averagePrice: listing.priceHistory.averagePrice,
          currency: listing.priceHistory.currency,
          firstObservedAt: listing.priceHistory.firstObservedAt,
          lastObservedAt: listing.priceHistory.lastObservedAt,
        }
      : null,
    targetPrice: listing.priceTarget?.currency
      ? {
          amount: listing.priceTarget.price,
          currency: listing.priceTarget.currency,
          basis: "marketplace_price",
        }
      : null,
    preferredMarketplaces: preferences?.preferredMarketplaces,
  });
}

function listingRecommendationOffer(listing: ApiListing): RecommendationOffer {
  return {
    id: listing.id ?? listingIdentity(listing.source, listing.externalId),
    source: listing.source,
    price: listing.price,
    currency: listing.currency,
    deliveredUnitCost: null,
    deliveredUnitCostCurrency: null,
    availability: listing.qualitySignals?.availability.rawStatus.value,
    availabilityStatus: listing.qualitySignals?.availability.status.value,
    availableQuantity: listing.qualitySignals?.availability.quantity.value,
    condition: listing.condition,
    qualitySignals: listing.qualitySignals,
  };
}

function buildSourcingComparisonRecommendation(
  group: MarketplaceProductComparison,
  offers: MarketplaceComparisonOffer[],
  product: RawApiSourcingListProduct,
  history: ApiSourcingPriceHistory | null,
  preferences: ShoppingPreferences | null,
  professionalEconomics: ProfessionalEconomicsResult | null,
) {
  const recommendationTarget = sourcingRecommendationTarget(product);
  const currentOffer = selectRecommendationOffer(group, offers);
  if (!currentOffer) return null;

  return buildProductRecommendation({
    currentOffer: toRecommendationOffer(currentOffer),
    competingOffers: offers.map(toRecommendationOffer),
    history: sourcingRecommendationHistory(
      history,
      currentOffer.source,
      recommendationTarget.basis,
    ),
    targetPrice: recommendationTarget.targetPrice,
    maximumPrice: recommendationTarget.maximumPrice,
    preferredCondition: product.preferred_condition,
    targetQuantity: product.target_quantity,
    preferredMarketplaces: preferences?.preferredMarketplaces,
    professionalEconomics,
  });
}

function selectRecommendationOffer(
  group: MarketplaceProductComparison,
  offers: MarketplaceComparisonOffer[],
) {
  const preferredIds = [
    group.cheapestQualifyingLandedOfferId,
    group.cheapestQualifyingOfferId,
  ].filter((value): value is string => Boolean(value));
  return (
    preferredIds
      .map((id) => offers.find((offer) => offer.offerId === id))
      .find((offer): offer is MarketplaceComparisonOffer => Boolean(offer)) ??
    offers.find((offer) => offer.qualification === "qualifies") ??
    offers[0] ??
    null
  );
}

function toRecommendationOffer(offer: MarketplaceComparisonOffer): RecommendationOffer {
  const delivered = offer.cost?.estimatedDeliveredUnitCost;
  return {
    id: offer.offerId,
    source: offer.source,
    price: offer.price,
    currency: offer.currency,
    deliveredUnitCost: delivered?.amount ?? offer.landedUnitCost,
    deliveredUnitCostCurrency: delivered?.currency ?? offer.landedUnitCostCurrency,
    costCompleteness: offer.cost?.completeness ?? null,
    costMissingComponents: offer.cost?.missingComponents,
    availableQuantity: offer.availableQuantity,
    availability: offer.availability,
    availabilityStatus: offer.qualitySignals?.availability.status.value,
    condition: offer.condition,
    qualitySignals: offer.qualitySignals,
    supplierStatus: offer.savedSupplier?.status ?? null,
    qualification: offer.qualification,
  };
}

function sourcingRecommendationTarget(product: RawApiSourcingListProduct): {
  basis: "marketplace_price" | "delivered_unit_cost";
  targetPrice: RecommendationTarget | null;
  maximumPrice: RecommendationTarget | null;
} {
  const maxLandedUnitCost = numericOrNull(product.max_landed_unit_cost);
  const maxLandedUnitCostCurrency = normalizeCurrency(product.max_landed_unit_cost_currency);
  if (maxLandedUnitCost !== null && maxLandedUnitCostCurrency) {
    const target = {
      amount: maxLandedUnitCost,
      currency: maxLandedUnitCostCurrency,
      basis: "delivered_unit_cost" as const,
    };
    return { basis: "delivered_unit_cost", targetPrice: null, maximumPrice: target };
  }

  const targetUnitCost = numericOrNull(product.target_unit_cost);
  const targetUnitCostCurrency = normalizeCurrency(product.target_unit_cost_currency);
  const maxUnitCost = numericOrNull(product.max_unit_cost);
  const maxUnitCostCurrency = normalizeCurrency(product.max_unit_cost_currency);
  return {
    basis: "marketplace_price",
    targetPrice:
      targetUnitCost !== null && targetUnitCostCurrency
        ? { amount: targetUnitCost, currency: targetUnitCostCurrency, basis: "marketplace_price" }
        : null,
    maximumPrice:
      maxUnitCost !== null && maxUnitCostCurrency
        ? { amount: maxUnitCost, currency: maxUnitCostCurrency, basis: "marketplace_price" }
        : null,
  };
}

function sourcingRecommendationHistory(
  history: ApiSourcingPriceHistory | null,
  source: string,
  basis: "marketplace_price" | "delivered_unit_cost",
): RecommendationHistory | null {
  const observations = (history?.observations ?? [])
    .filter((observation) => observation.source === source)
    .map((observation) => {
      const amount =
        basis === "delivered_unit_cost" ? observation.landedUnitCost : observation.observedPrice;
      const currency =
        basis === "delivered_unit_cost" ? observation.landedUnitCostCurrency : observation.currency;
      return { amount, currency, observedAt: observation.observedAt };
    })
    .filter(
      (observation): observation is { amount: number; currency: string; observedAt: string } =>
        observation.amount !== null &&
        Number.isFinite(observation.amount) &&
        Boolean(normalizeCurrency(observation.currency)),
    )
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  const latestCurrency = normalizeCurrency(observations[0]?.currency);
  if (!latestCurrency) return null;

  const comparable = observations
    .filter((observation) => normalizeCurrency(observation.currency) === latestCurrency)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const values = comparable.map((observation) => observation.amount);
  const enoughHistory = values.length >= 3;
  return {
    basis,
    status: enoughHistory ? "available" : "insufficient_history",
    observationCount: values.length,
    lowestPrice: values.length > 0 ? Math.min(...values) : null,
    highestPrice: values.length > 0 ? Math.max(...values) : null,
    medianPrice: enoughHistory ? medianValue(values) : null,
    averagePrice: enoughHistory
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    currency: latestCurrency,
    firstObservedAt: comparable[0]?.observedAt ?? null,
    lastObservedAt: comparable.at(-1)?.observedAt ?? null,
  };
}

function medianValue(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function toComparisonCriteria(product: {
  target_quantity: number;
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
  preferred_condition: string | null;
}): ComparisonCriteria {
  return {
    targetQuantity: product.target_quantity,
    maxUnitCost: numericOrNull(product.max_unit_cost),
    maxUnitCostCurrency: product.max_unit_cost_currency,
    estimatedShippingCost: numericOrNull(product.estimated_shipping_cost),
    estimatedShippingCurrency: product.estimated_shipping_currency,
    estimatedDutiesTaxes: numericOrNull(product.estimated_duties_taxes),
    estimatedDutiesTaxesCurrency: product.estimated_duties_taxes_currency,
    otherSourcingCost: numericOrNull(product.other_sourcing_cost),
    otherSourcingCostCurrency: product.other_sourcing_cost_currency,
    maxLandedUnitCost: numericOrNull(product.max_landed_unit_cost),
    maxLandedUnitCostCurrency: product.max_landed_unit_cost_currency,
    preferredCondition: product.preferred_condition,
  };
}

function numericOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addCurrency(currencies: Set<string>, value: string | null | undefined) {
  if (typeof value !== "string") return;
  const currency = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) currencies.add(currency);
}

function toApiComparisonShortlist(
  item: import("./types").RawApiComparisonShortlist,
): import("./types").ApiComparisonShortlist {
  return {
    id: item.id,
    sourcingListProductId: item.sourcing_list_product_id,
    supplierId: item.supplier_id,
    offer: item.offer_snapshot as unknown as MarketplaceComparisonOffer,
    createdAt: item.created_at,
  };
}

function toApiSupplier(item: RawApiSupplier): ApiSupplier {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    name: item.name,
    marketplace: item.marketplace_id,
    marketplaceSellerId: item.marketplace_seller_id,
    supplierUrl: item.supplier_url,
    notes: item.notes,
    tags: item.tags,
    status: item.status,
    internalContactInfo: item.internal_contact_info,
    typicalLeadTimeDays: item.typical_lead_time_days,
    minimumOrderQuantity: item.minimum_order_quantity,
    shortlistedCount: item.shortlisted_count,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toApiSupplierShortlistHistory(
  item: RawApiSupplierShortlistHistory,
): ApiSupplierShortlistHistory {
  return {
    id: item.id,
    supplierId: item.supplier_id,
    sourcingListProductId: item.sourcing_list_product_id,
    marketplace: item.marketplace_id,
    externalId: item.external_id,
    listingId: item.listing_id,
    offer: item.offer_snapshot as unknown as import("./types").ApiComparisonOffer,
    firstShortlistedAt: item.first_shortlisted_at,
    lastShortlistedAt: item.last_shortlisted_at,
  };
}

function findSavedSupplier(
  offer: MarketplaceComparisonOffer,
  suppliers: RawApiSupplier[],
): { id: string; name: string; status: RawApiSupplier["status"] } | null {
  const sellerName = normalizeSupplierName(offer.sellerName);
  const match = suppliers.find(
    (supplier) =>
      (offer.sellerId && supplier.marketplace_seller_id === offer.sellerId) ||
      (sellerName !== null &&
        supplier.marketplace_seller_id === null &&
        normalizeSupplierName(supplier.name) === sellerName),
  );
  return match ? { id: match.id, name: match.name, status: match.status } : null;
}

function normalizeSupplierName(name: string | null | undefined) {
  const normalized = name?.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function toApiComparisonManualGroup(
  item: import("./types").RawApiComparisonManualGroup,
): import("./types").ApiComparisonManualGroup {
  return {
    id: item.id,
    sourcingListProductId: item.sourcing_list_product_id,
    members: item.member_refs,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

type ApiListingPriceOptions = Pick<
  ApiListing,
  | "sourcePrice"
  | "sourceCurrency"
  | "convertedPrice"
  | "convertedCurrency"
  | "exchangeRate"
  | "exchangeRateAsOf"
  | "exchangeRateSource"
  | "conversionStatus"
>;

function toMatch(match: StoredMatch, priceOptions?: ApiListingPriceOptions): ApiMatch {
  const listing = unwrap(match.listing);
  const watchlist = unwrap(match.watchlist);
  if (!listing || !watchlist) {
    throw new Error("Match response is missing its listing or watchlist.");
  }

  return {
    id: match.id,
    status: match.status,
    feedback: match.feedback ?? null,
    matchedAt: match.matched_at,
    watchlist: { id: watchlist.id, name: watchlist.name },
    listing: toApiListing(listing, {
      id: listing.id,
      matchedAt: match.matched_at,
      isFavorite: match.favorite,
      ...priceOptions,
    }),
  };
}

function toNotification(notification: import("./types").RawApiNotification): ApiNotification {
  return {
    id: notification.id,
    matchId: notification.match_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.read_at,
    sentAt: notification.sent_at,
    createdAt: notification.created_at,
  };
}

function unwrap<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function listingIdentity(source: string, externalId: string) {
  return `${source}:${externalId}`;
}
