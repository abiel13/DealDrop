export const MIN_PRICE_HISTORY_OBSERVATIONS = 3;

export type PriceHistoryStatus = "available" | "insufficient_history" | "unavailable";
export type DealIndicator = "below_history" | "typical" | "above_history";

export interface PriceObservation {
  price: number;
  currency: string;
  observedAt: string;
  marketplace?: string | null;
  shippingPrice?: number | null;
  shippingCurrency?: string | null;
  condition?: string | null;
}

export interface ProductPriceObservation extends PriceObservation {
  marketplace: string;
}

export interface PriceHistoryMarketplaceSummary {
  marketplace: string;
  status: PriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  explanation: string;
}

export interface PriceHistorySummary {
  status: PriceHistoryStatus;
  observationCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  currency: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  currentObservedPrice: number | null;
  currentObservedCurrency: string | null;
  currentObservedAt: string | null;
  marketplaces: PriceHistoryMarketplaceSummary[];
  dealIndicator: DealIndicator | null;
  explanation: string;
}

export function summarizePriceHistory(
  currentPrice: number | null,
  currentCurrency: string | null,
  observations: readonly PriceObservation[],
): PriceHistorySummary {
  const currency = normalizeCurrency(currentCurrency);
  if (currentPrice === null || !currency) {
    return unavailableSummary(
      "Price history is unavailable because this listing does not have a comparable currency.",
    );
  }

  const sameCurrencyObservations = observations
    .filter((observation) => normalizeCurrency(observation.currency) === currency)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (sameCurrencyObservations.length === 0) {
    const hasOtherCurrencyHistory = observations.length > 0;
    return unavailableSummary(
      hasOtherCurrencyHistory
        ? `Price history is unavailable because the available observations use a different currency from ${currency}.`
        : `Not enough ${currency} price history is available yet.`,
      currency,
    );
  }

  const prices = sameCurrencyObservations.map((observation) => observation.price);
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const firstObservedAt = sameCurrencyObservations[0]?.observedAt ?? null;
  const lastObservedAt = sameCurrencyObservations.at(-1)?.observedAt ?? null;
  const medianPrice =
    sameCurrencyObservations.length >= MIN_PRICE_HISTORY_OBSERVATIONS ? median(prices) : null;

  if (sameCurrencyObservations.length < MIN_PRICE_HISTORY_OBSERVATIONS) {
    return {
      status: "insufficient_history",
      observationCount: sameCurrencyObservations.length,
      lowestPrice,
      highestPrice,
      medianPrice,
      averagePrice,
      currency,
      firstObservedAt,
      lastObservedAt,
      currentObservedPrice: currentPrice,
      currentObservedCurrency: currency,
      currentObservedAt: lastObservedAt,
      marketplaces: [],
      dealIndicator: null,
      explanation: `Only ${sameCurrencyObservations.length} same-currency observation${sameCurrencyObservations.length === 1 ? " is" : "s are"} available; more history is needed to assess this deal.`,
    };
  }

  const differenceFromAverage = currentPrice - averagePrice;
  const tolerance = Math.max(0.01, averagePrice * 0.005);
  const dealIndicator: DealIndicator =
    differenceFromAverage < -tolerance
      ? "below_history"
      : differenceFromAverage > tolerance
        ? "above_history"
        : "typical";

  return {
    status: "available",
    observationCount: sameCurrencyObservations.length,
    lowestPrice,
    highestPrice,
    medianPrice,
    averagePrice,
    currency,
    firstObservedAt,
    lastObservedAt,
    currentObservedPrice: currentPrice,
    currentObservedCurrency: currency,
    currentObservedAt: lastObservedAt,
    marketplaces: [],
    dealIndicator,
    explanation:
      dealIndicator === "below_history"
        ? `The current price is below the average of ${sameCurrencyObservations.length} same-currency observations.`
        : dealIndicator === "above_history"
          ? `The current price is above the average of ${sameCurrencyObservations.length} same-currency observations.`
          : `The current price is within the typical range of ${sameCurrencyObservations.length} same-currency observations.`,
  };
}

export function summarizeProductPriceHistory(
  observations: readonly ProductPriceObservation[],
): PriceHistorySummary {
  const ordered = observations
    .filter((observation) => Number.isFinite(observation.price) && Boolean(observation.currency))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  const current = ordered[0] ?? null;
  const currentCurrency = normalizeCurrency(current?.currency);
  if (!current || !currentCurrency) {
    return unavailableSummary(
      "Price history is unavailable because DealDrop has not observed a comparable product price yet.",
    );
  }

  const sameCurrencyObservations = ordered
    .filter((observation) => normalizeCurrency(observation.currency) === currentCurrency)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const summary = summarizeComparableSeries(
    current.price,
    currentCurrency,
    sameCurrencyObservations,
    buildMarketplaceSummaries(ordered),
  );

  return {
    ...summary,
    currentObservedPrice: current.price,
    currentObservedCurrency: currentCurrency,
    currentObservedAt: current.observedAt,
    explanation: explainProductHistory(summary, ordered.length),
  };
}

function summarizeComparableSeries(
  currentPrice: number,
  currency: string,
  observations: readonly PriceObservation[],
  marketplaces: PriceHistoryMarketplaceSummary[],
): PriceHistorySummary {
  const prices = observations.map((observation) => observation.price);
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
  const averagePrice =
    prices.length >= MIN_PRICE_HISTORY_OBSERVATIONS
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length
      : null;
  const medianPrice = prices.length >= MIN_PRICE_HISTORY_OBSERVATIONS ? median(prices) : null;
  const firstObservedAt = observations[0]?.observedAt ?? null;
  const lastObservedAt = observations.at(-1)?.observedAt ?? null;

  if (prices.length < MIN_PRICE_HISTORY_OBSERVATIONS) {
    return {
      status: "insufficient_history",
      observationCount: prices.length,
      lowestPrice,
      highestPrice,
      medianPrice,
      averagePrice,
      currency,
      firstObservedAt,
      lastObservedAt,
      currentObservedPrice: currentPrice,
      currentObservedCurrency: currency,
      currentObservedAt: lastObservedAt,
      marketplaces,
      dealIndicator: null,
      explanation: `Only ${prices.length} same-currency product observation${prices.length === 1 ? " is" : "s are"} available; more observed data is needed before summarizing this history.`,
    };
  }

  const differenceFromAverage = currentPrice - averagePrice!;
  const tolerance = Math.max(0.01, averagePrice! * 0.005);
  const dealIndicator: DealIndicator =
    differenceFromAverage < -tolerance
      ? "below_history"
      : differenceFromAverage > tolerance
        ? "above_history"
        : "typical";

  return {
    status: "available",
    observationCount: prices.length,
    lowestPrice,
    highestPrice,
    medianPrice,
    averagePrice,
    currency,
    firstObservedAt,
    lastObservedAt,
    currentObservedPrice: currentPrice,
    currentObservedCurrency: currency,
    currentObservedAt: lastObservedAt,
    marketplaces,
    dealIndicator,
    explanation:
      dealIndicator === "below_history"
        ? `The current observed price is below the average of ${prices.length} same-currency product observations.`
        : dealIndicator === "above_history"
          ? `The current observed price is above the average of ${prices.length} same-currency product observations.`
          : `The current observed price is within the range of ${prices.length} same-currency product observations.`,
  };
}

function buildMarketplaceSummaries(
  observations: readonly ProductPriceObservation[],
): PriceHistoryMarketplaceSummary[] {
  const byMarketplace = new Map<string, ProductPriceObservation[]>();
  for (const observation of observations) {
    const existing = byMarketplace.get(observation.marketplace) ?? [];
    existing.push(observation);
    byMarketplace.set(observation.marketplace, existing);
  }

  return [...byMarketplace.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([marketplace, marketplaceObservations]) => {
      const ordered = [...marketplaceObservations].sort((left, right) =>
        right.observedAt.localeCompare(left.observedAt),
      );
      const current = ordered[0]!;
      const currency = normalizeCurrency(current.currency);
      const sameCurrency = ordered
        .filter((observation) => normalizeCurrency(observation.currency) === currency)
        .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
      const prices = sameCurrency.map((observation) => observation.price);
      const hasEnoughHistory = prices.length >= MIN_PRICE_HISTORY_OBSERVATIONS;

      return {
        marketplace,
        status: hasEnoughHistory ? ("available" as const) : ("insufficient_history" as const),
        observationCount: prices.length,
        lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
        highestPrice: prices.length > 0 ? Math.max(...prices) : null,
        medianPrice: hasEnoughHistory ? median(prices) : null,
        averagePrice: hasEnoughHistory
          ? prices.reduce((sum, price) => sum + price, 0) / prices.length
          : null,
        currency,
        firstObservedAt: sameCurrency[0]?.observedAt ?? null,
        lastObservedAt: sameCurrency.at(-1)?.observedAt ?? null,
        explanation: hasEnoughHistory
          ? `Based on ${prices.length} ${currency} observations from this marketplace.`
          : `Only ${prices.length} comparable ${currency ?? "currency"} observation${prices.length === 1 ? " is" : "s are"} available from this marketplace.`,
      };
    });
}

function explainProductHistory(summary: PriceHistorySummary, totalObservationCount: number) {
  if (summary.status === "unavailable") {
    return summary.explanation;
  }

  const marketplaceCount = summary.marketplaces.length;
  const marketplaceLabel = marketplaceCount === 1 ? "marketplace" : "marketplaces";
  const window =
    summary.firstObservedAt && summary.lastObservedAt
      ? ` from ${summary.firstObservedAt} through ${summary.lastObservedAt}`
      : "";
  if (summary.status === "insufficient_history") {
    return `${summary.explanation} The available product data covers ${totalObservationCount} observation${totalObservationCount === 1 ? "" : "s"}${window} across ${marketplaceCount} ${marketplaceLabel}; no unsupported time-window claim is made.`;
  }

  return `${summary.explanation} Based on observations${window} across ${marketplaceCount} ${marketplaceLabel}.`;
}

function unavailableSummary(explanation: string, currency: string | null = null) {
  return {
    status: "unavailable" as const,
    observationCount: 0,
    lowestPrice: null,
    highestPrice: null,
    medianPrice: null,
    averagePrice: null,
    currency,
    firstObservedAt: null,
    lastObservedAt: null,
    currentObservedPrice: null,
    currentObservedCurrency: currency,
    currentObservedAt: null,
    marketplaces: [],
    dealIndicator: null,
    explanation,
  };
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || null;
}
