export const MIN_PRICE_HISTORY_OBSERVATIONS = 3;

export type PriceHistoryStatus = "available" | "insufficient_history" | "unavailable";
export type DealIndicator = "below_history" | "typical" | "above_history";

export interface PriceObservation {
  price: number;
  currency: string;
  observedAt: string;
}

export interface PriceHistorySummary {
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

  if (sameCurrencyObservations.length < MIN_PRICE_HISTORY_OBSERVATIONS) {
    return {
      status: "insufficient_history",
      observationCount: sameCurrencyObservations.length,
      lowestPrice,
      highestPrice,
      averagePrice,
      currency,
      firstObservedAt,
      lastObservedAt,
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
    averagePrice,
    currency,
    firstObservedAt,
    lastObservedAt,
    dealIndicator,
    explanation:
      dealIndicator === "below_history"
        ? `The current price is below the average of ${sameCurrencyObservations.length} same-currency observations.`
        : dealIndicator === "above_history"
          ? `The current price is above the average of ${sameCurrencyObservations.length} same-currency observations.`
          : `The current price is within the typical range of ${sameCurrencyObservations.length} same-currency observations.`,
  };
}

function unavailableSummary(explanation: string, currency: string | null = null) {
  return {
    status: "unavailable" as const,
    observationCount: 0,
    lowestPrice: null,
    highestPrice: null,
    averagePrice: null,
    currency,
    firstObservedAt: null,
    lastObservedAt: null,
    dealIndicator: null,
    explanation,
  };
}

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || null;
}
