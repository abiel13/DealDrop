import type {
  ApiSourcingPriceHistory,
  ApiSourcingPriceSourceSummary,
  RawApiSourcingListProduct,
  RawApiSourcingPriceObservation,
} from "../api/types";

const MIN_MEANINGFUL_OBSERVATIONS = 3;

export function summarizeSourcingPriceHistory(
  product: RawApiSourcingListProduct,
  observations: readonly RawApiSourcingPriceObservation[],
): ApiSourcingPriceHistory {
  const ordered = [...observations].sort((left, right) =>
    right.observed_at.localeCompare(left.observed_at),
  );
  const sources = [...new Set(ordered.map((observation) => observation.marketplace_id))]
    .sort()
    .map((source) =>
      summarizeSource(
        product,
        source,
        ordered.filter((item) => item.marketplace_id === source),
      ),
    );

  return {
    sourcingListProductId: product.id,
    targetPrice: targetPrice(product),
    targetPriceCurrency: targetPriceCurrency(product),
    targetCostBasis: product.alert_cost_basis,
    totalObservationCount: ordered.length,
    firstObservedAt: ordered.at(-1)?.observed_at ?? null,
    lastObservedAt: ordered[0]?.observed_at ?? null,
    sources,
    observations: ordered.slice(0, 100).map(toApiObservation),
  };
}

function summarizeSource(
  product: RawApiSourcingListProduct,
  source: ApiSourcingPriceSourceSummary["source"],
  observations: RawApiSourcingPriceObservation[],
): ApiSourcingPriceSourceSummary {
  const current = observations[0] ?? null;
  const currentCurrency = normalizeCurrency(current?.currency);
  const priced = observations.filter(
    (observation) =>
      observation.observed_price !== null &&
      normalizeCurrency(observation.currency) === currentCurrency,
  );
  const hasMeaningfulHistory = priced.length >= MIN_MEANINGFUL_OBSERVATIONS;
  const prices = hasMeaningfulHistory
    ? priced.map((observation) => Number(observation.observed_price))
    : [];
  const previousPriced = priced.find(
    (observation) => observation.observed_at !== current?.observed_at,
  );
  const movement = compareMovement(current, previousPriced, currentCurrency);

  return {
    source,
    currentObservedPrice: toNumber(current?.observed_price),
    currentObservedCurrency: currentCurrency,
    currentObservedAt: current?.observed_at ?? null,
    recentLow: prices.length > 0 ? Math.min(...prices) : null,
    recentHigh: prices.length > 0 ? Math.max(...prices) : null,
    averageObservedPrice: prices.length > 0 ? average(prices) : null,
    currency: currentCurrency,
    observationCount: priced.length,
    firstObservedAt: observations.at(-1)?.observed_at ?? null,
    lastObservedAt: current?.observed_at ?? null,
    movement,
    targetReached: targetReached(product, current),
  };
}

function toApiObservation(observation: RawApiSourcingPriceObservation) {
  return {
    id: observation.id,
    source: observation.marketplace_id,
    externalId: observation.external_id,
    listingId: observation.listing_id,
    title: observation.title,
    sellerName: observation.seller_name,
    url: observation.url,
    observedPrice: toNumber(observation.observed_price),
    currency: normalizeCurrency(observation.currency),
    availableQuantity: observation.available_quantity,
    shippingCost: toNumber(observation.shipping_cost),
    shippingCurrency: normalizeCurrency(observation.shipping_currency),
    landedUnitCost: toNumber(observation.landed_unit_cost),
    landedUnitCostCurrency: normalizeCurrency(observation.landed_unit_cost_currency),
    availability: observation.availability,
    observedAt: observation.observed_at,
  };
}

function targetPrice(product: RawApiSourcingListProduct) {
  if (product.alert_cost_basis === "landed_unit_cost") {
    return toNumber(product.max_landed_unit_cost);
  }

  return toNumber(product.target_unit_cost) ?? toNumber(product.max_unit_cost);
}

function targetPriceCurrency(product: RawApiSourcingListProduct) {
  if (product.alert_cost_basis === "landed_unit_cost") {
    return normalizeCurrency(product.max_landed_unit_cost_currency);
  }

  return (
    normalizeCurrency(product.target_unit_cost_currency) ??
    normalizeCurrency(product.max_unit_cost_currency)
  );
}

function targetReached(
  product: RawApiSourcingListProduct,
  observation: RawApiSourcingPriceObservation | null,
) {
  if (!observation) return null;
  const target = targetPrice(product);
  const currency = targetPriceCurrency(product);
  const current =
    product.alert_cost_basis === "landed_unit_cost"
      ? toNumber(observation.landed_unit_cost)
      : toNumber(observation.observed_price);
  const currentCurrency =
    product.alert_cost_basis === "landed_unit_cost"
      ? normalizeCurrency(observation.landed_unit_cost_currency)
      : normalizeCurrency(observation.currency);
  if (target === null || current === null || !currency || currency !== currentCurrency) {
    return null;
  }

  return current <= target;
}

function compareMovement(
  current: RawApiSourcingPriceObservation | null,
  previous: RawApiSourcingPriceObservation | undefined,
  currency: string | null,
) {
  if (!current || !previous || !currency) return "unknown" as const;
  const currentPrice = toNumber(current.observed_price);
  const previousPrice = toNumber(previous.observed_price);
  if (
    currentPrice === null ||
    previousPrice === null ||
    normalizeCurrency(previous.currency) !== currency
  ) {
    return "unknown" as const;
  }
  if (currentPrice < previousPrice) return "down" as const;
  if (currentPrice > previousPrice) return "up" as const;
  return "stable" as const;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}
