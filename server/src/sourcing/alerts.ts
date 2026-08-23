import type { ComparisonCriteria, MarketplaceComparisonOffer } from "../marketplaces/comparison";
import type { MarketplaceSource } from "../marketplaces/shared/types";

export type SourcingOpportunityAlertType =
  | "sourcing_target_price_reached"
  | "sourcing_new_cheaper_source"
  | "sourcing_price_dropped"
  | "sourcing_quantity_available"
  | "sourcing_back_in_stock";

export interface SourcingMonitoringTarget {
  workspaceId: string;
  sourcingListId: string;
  sourcingListName: string;
  productId: string;
  productName: string;
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
  keywords: string[];
  targetQuantity: number;
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
  maxLandedUnitCost: number | null;
  maxLandedUnitCostCurrency: string | null;
  alertCostBasis: "marketplace_price" | "landed_unit_cost";
  preferredCondition: string | null;
  marketplaceIds: MarketplaceSource[];
  alertEnabled: boolean;
  alertTargetPriceReached: boolean;
  alertNewCheaperSource: boolean;
  alertPriceDropped: boolean;
  alertQuantityAvailable: boolean;
  alertBackInStock: boolean;
  alertCooldownMinutes: number;
  memberUserIds: string[];
}

export interface SourcingProductAlertState {
  source: MarketplaceSource;
  externalId: string;
  price: number | null;
  currency: string | null;
  landedUnitCost: number | null;
  landedUnitCostCurrency: string | null;
  availableQuantity: number | null;
  availability: string | null;
  observedAt: string;
  targetReached: boolean | null;
  lastNotifiedAt: string | null;
  lastNotifiedType: SourcingOpportunityAlertType | null;
}

export interface SourcingOpportunityAlert {
  type: SourcingOpportunityAlertType;
  offer: MarketplaceComparisonOffer;
  title: string;
  body: string;
}

export interface SourcingProductAlertStateUpdate extends SourcingProductAlertState {}

export interface SourcingAlertEvaluation {
  alerts: SourcingOpportunityAlert[];
  stateUpdates: SourcingProductAlertStateUpdate[];
}

export function toSourcingComparisonCriteria(target: SourcingMonitoringTarget): ComparisonCriteria {
  return {
    targetQuantity: target.targetQuantity,
    maxUnitCost: target.maxUnitCost,
    maxUnitCostCurrency: target.maxUnitCostCurrency,
    estimatedShippingCost: target.estimatedShippingCost,
    estimatedShippingCurrency: target.estimatedShippingCurrency,
    estimatedDutiesTaxes: target.estimatedDutiesTaxes,
    estimatedDutiesTaxesCurrency: target.estimatedDutiesTaxesCurrency,
    otherSourcingCost: target.otherSourcingCost,
    otherSourcingCostCurrency: target.otherSourcingCostCurrency,
    maxLandedUnitCost: target.maxLandedUnitCost,
    maxLandedUnitCostCurrency: target.maxLandedUnitCostCurrency,
    preferredCondition: target.preferredCondition,
  };
}

export function evaluateSourcingOpportunityAlerts(
  target: SourcingMonitoringTarget,
  offers: readonly MarketplaceComparisonOffer[],
  previousStates: readonly SourcingProductAlertState[],
  observedAt: string,
): SourcingAlertEvaluation {
  if (!target.alertEnabled) {
    return { alerts: [], stateUpdates: offers.map((offer) => toState(offer, null, observedAt)) };
  }

  const previousByOffer = new Map(
    previousStates.map((state) => [offerKey(state.source, state.externalId), state]),
  );
  const alerts: SourcingOpportunityAlert[] = [];
  const stateUpdates: SourcingProductAlertStateUpdate[] = [];

  for (const offer of offers) {
    const previous = previousByOffer.get(offerKey(offer.source, offer.externalId));
    const targetReached = isTargetReached(target, offer);
    const canNotify = (type: SourcingOpportunityAlertType) =>
      canSendAlert(previous, type, observedAt, target.alertCooldownMinutes);

    if (
      target.alertTargetPriceReached &&
      targetReached === true &&
      previous?.targetReached !== true &&
      canNotify("sourcing_target_price_reached")
    ) {
      alerts.push({
        type: "sourcing_target_price_reached",
        offer,
        title: `${target.productName} reached its target`,
        body: `${target.productName} is at ${formatOfferCost(target, offer)} on ${displaySource(offer.source)}.`,
      });
    }

    if (
      target.alertPriceDropped &&
      previous &&
      priceDropped(previous, offer) &&
      canNotify("sourcing_price_dropped")
    ) {
      alerts.push({
        type: "sourcing_price_dropped",
        offer,
        title: `${target.productName} price dropped`,
        body: `${target.productName} fell to ${formatMoney(offer.price, offer.currency)} on ${displaySource(offer.source)}.`,
      });
    }

    if (
      target.alertNewCheaperSource &&
      isNewCheaperSource(target, offer, previousStates) &&
      canNotify("sourcing_new_cheaper_source")
    ) {
      alerts.push({
        type: "sourcing_new_cheaper_source",
        offer,
        title: `A cheaper source was found for ${target.productName}`,
        body: `${displaySource(offer.source)} has ${target.productName} at ${formatOfferCost(target, offer)}.`,
      });
    }

    if (
      target.alertQuantityAvailable &&
      quantityBecameAvailable(previous, offer, target.targetQuantity) &&
      canNotify("sourcing_quantity_available")
    ) {
      alerts.push({
        type: "sourcing_quantity_available",
        offer,
        title: `${target.productName} quantity is available`,
        body: `${displaySource(offer.source)} now shows enough quantity for ${target.productName}.`,
      });
    }

    if (
      target.alertBackInStock &&
      becameAvailable(previous, offer) &&
      canNotify("sourcing_back_in_stock")
    ) {
      alerts.push({
        type: "sourcing_back_in_stock",
        offer,
        title: `${target.productName} is available again`,
        body: `${target.productName} is no longer marked unavailable on ${displaySource(offer.source)}.`,
      });
    }

    const notified = alerts.filter((alert) => alert.offer.offerId === offer.offerId).at(-1);
    stateUpdates.push(
      toState(
        offer,
        previous ?? null,
        observedAt,
        targetReached,
        notified?.type ?? previous?.lastNotifiedType ?? null,
        notified ? observedAt : (previous?.lastNotifiedAt ?? null),
      ),
    );
  }

  return { alerts, stateUpdates };
}

function toState(
  offer: MarketplaceComparisonOffer,
  previous: SourcingProductAlertState | null,
  observedAt: string,
  targetReached: boolean | null = null,
  lastNotifiedType: SourcingOpportunityAlertType | null = previous?.lastNotifiedType ?? null,
  lastNotifiedAt: string | null = previous?.lastNotifiedAt ?? null,
): SourcingProductAlertStateUpdate {
  return {
    source: offer.source,
    externalId: offer.externalId,
    price: offer.price,
    currency: offer.currency,
    landedUnitCost: offer.landedUnitCost,
    landedUnitCostCurrency: offer.landedUnitCostCurrency,
    availableQuantity: offer.availableQuantity,
    availability: offer.availability,
    observedAt,
    targetReached,
    lastNotifiedAt,
    lastNotifiedType,
  };
}

function isTargetReached(target: SourcingMonitoringTarget, offer: MarketplaceComparisonOffer) {
  const targetValue =
    target.alertCostBasis === "landed_unit_cost"
      ? target.maxLandedUnitCost
      : (target.targetUnitCost ?? target.maxUnitCost);
  const targetCurrency =
    target.alertCostBasis === "landed_unit_cost"
      ? target.maxLandedUnitCostCurrency
      : (target.targetUnitCostCurrency ?? target.maxUnitCostCurrency);
  const offerValue =
    target.alertCostBasis === "landed_unit_cost" ? offer.landedUnitCost : offer.price;
  const offerCurrency =
    target.alertCostBasis === "landed_unit_cost" ? offer.landedUnitCostCurrency : offer.currency;

  if (targetValue === null || offerValue === null) return null;
  if (normalizeCurrency(targetCurrency) !== normalizeCurrency(offerCurrency)) return null;
  return offerValue <= targetValue;
}

function isNewCheaperSource(
  target: SourcingMonitoringTarget,
  offer: MarketplaceComparisonOffer,
  previousStates: readonly SourcingProductAlertState[],
) {
  const current = offerCost(target, offer);
  if (!current) return false;

  return previousStates.some((state) => {
    if (state.source === offer.source) return false;
    const previous = stateCost(target, state);
    return Boolean(
      previous && previous.currency === current.currency && current.amount < previous.amount,
    );
  });
}

function priceDropped(previous: SourcingProductAlertState, offer: MarketplaceComparisonOffer) {
  return Boolean(
    previous.price !== null &&
    offer.price !== null &&
    normalizeCurrency(previous.currency) === normalizeCurrency(offer.currency) &&
    offer.price < previous.price,
  );
}

function quantityBecameAvailable(
  previous: SourcingProductAlertState | undefined,
  offer: MarketplaceComparisonOffer,
  targetQuantity: number,
) {
  return Boolean(
    offer.availableQuantity !== null &&
    offer.availableQuantity >= targetQuantity &&
    (!previous ||
      previous.availableQuantity === null ||
      previous.availableQuantity < targetQuantity),
  );
}

function becameAvailable(
  previous: SourcingProductAlertState | undefined,
  offer: MarketplaceComparisonOffer,
) {
  if (!previous || !isOfferAvailable(offer)) return false;
  return !isStateAvailable(previous);
}

function canSendAlert(
  previous: SourcingProductAlertState | undefined,
  type: SourcingOpportunityAlertType,
  observedAt: string,
  cooldownMinutes: number,
) {
  if (!previous?.lastNotifiedAt) return true;
  if (previous.lastNotifiedType !== type) return true;
  const elapsed = Date.parse(observedAt) - Date.parse(previous.lastNotifiedAt);
  return !Number.isFinite(elapsed) || elapsed >= cooldownMinutes * 60_000;
}

function offerCost(target: SourcingMonitoringTarget, offer: MarketplaceComparisonOffer) {
  const amount = target.alertCostBasis === "landed_unit_cost" ? offer.landedUnitCost : offer.price;
  const currency =
    target.alertCostBasis === "landed_unit_cost" ? offer.landedUnitCostCurrency : offer.currency;
  if (amount === null || !currency) return null;
  return { amount, currency: normalizeCurrency(currency) };
}

function stateCost(target: SourcingMonitoringTarget, state: SourcingProductAlertState) {
  const amount = target.alertCostBasis === "landed_unit_cost" ? state.landedUnitCost : state.price;
  const currency =
    target.alertCostBasis === "landed_unit_cost" ? state.landedUnitCostCurrency : state.currency;
  if (amount === null || !currency) return null;
  return { amount, currency: normalizeCurrency(currency) };
}

function isOfferAvailable(offer: MarketplaceComparisonOffer) {
  if (offer.availableQuantity !== null) return offer.availableQuantity > 0;
  return !isUnavailable(offer.availability);
}

function isStateAvailable(state: SourcingProductAlertState) {
  if (state.availableQuantity !== null) return state.availableQuantity > 0;
  return !isUnavailable(state.availability);
}

function isUnavailable(value: string | null) {
  return Boolean(value && /unavailable|out of stock|sold out/i.test(value));
}

function formatOfferCost(target: SourcingMonitoringTarget, offer: MarketplaceComparisonOffer) {
  const cost = offerCost(target, offer);
  return cost ? formatMoney(cost.amount, cost.currency) : "an unknown cost";
}

function formatMoney(amount: number | null, currency: string | null) {
  return amount === null
    ? "an unknown price"
    : `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

function normalizeCurrency(value: string | null) {
  return value?.trim().toUpperCase() || null;
}

function offerKey(source: MarketplaceSource, externalId: string) {
  return `${source}:${externalId}`;
}

function displaySource(source: MarketplaceSource) {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
