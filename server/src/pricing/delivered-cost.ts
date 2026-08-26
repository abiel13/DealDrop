import type { ExchangeRate } from "./currency";

export type DeliveredCostComponentName =
  "shipping" | "buyerFees" | "taxes" | "duties" | "otherCosts";

export type DeliveredCostComponentState = "known" | "estimated" | "unknown";
export type DeliveredCostComponentSource = "marketplace" | "provider" | "user" | "unknown";
export type DeliveredCostCompleteness =
  "complete" | "partial" | "currency_mismatch" | "unavailable";

export interface DeliveredCostComponentInput {
  amount: number | null;
  currency: string | null;
  state?: DeliveredCostComponentState;
  source?: DeliveredCostComponentSource;
}

export interface ProviderDeliveredCostInput extends DeliveredCostComponentInput {
  amount: number;
  currency: string;
  state?: "known" | "estimated";
  source?: "marketplace" | "provider";
  includes: "all" | readonly DeliveredCostComponentName[];
}

export interface DeliveredCostInput {
  sourcePrice: DeliveredCostComponentInput;
  /** Quantity in the sourcing request; additional costs are allocated per unit. */
  quantity?: number | null;
  shipping?: DeliveredCostComponentInput | null;
  buyerFees?: DeliveredCostComponentInput | null;
  taxes?: DeliveredCostComponentInput | null;
  duties?: DeliveredCostComponentInput | null;
  otherCosts?: DeliveredCostComponentInput | null;
  targetCurrency?: string | null;
  exchangeRates?: ReadonlyMap<string, ExchangeRate>;
  providerDeliveredCost?: ProviderDeliveredCostInput | null;
}

export interface DeliveredCostMoney {
  amount: number;
  currency: string;
}

export interface DeliveredCostComponent {
  amount: number | null;
  currency: string | null;
  state: DeliveredCostComponentState;
  source: DeliveredCostComponentSource;
  convertedAmount: number | null;
  convertedCurrency: string | null;
}

export interface DeliveredCostConversion {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  observedAt: string;
  source: string;
}

export interface DeliveredCostResult {
  sourcePrice: DeliveredCostComponent;
  sourcePriceInCalculationCurrency: DeliveredCostMoney | null;
  calculationCurrency: string | null;
  components: {
    shipping: DeliveredCostComponent;
    buyerFees: DeliveredCostComponent;
    taxes: DeliveredCostComponent;
    duties: DeliveredCostComponent;
    otherCosts: DeliveredCostComponent;
  };
  knownAdditionalCost: DeliveredCostMoney | null;
  /** Total for the requested quantity, including the per-unit source price. */
  estimatedDeliveredCost: DeliveredCostMoney | null;
  /** Total divided by the requested quantity for offer comparison. */
  estimatedDeliveredUnitCost: DeliveredCostMoney | null;
  completeness: DeliveredCostCompleteness;
  missingComponents: string[];
  isEstimate: boolean;
  conversions: DeliveredCostConversion[];
  providerDeliveredCost: DeliveredCostComponent | null;
}

const COMPONENTS: ReadonlyArray<{
  name: DeliveredCostComponentName;
  label: string;
}> = [
  { name: "shipping", label: "Shipping" },
  { name: "buyerFees", label: "Marketplace fees" },
  { name: "taxes", label: "Taxes" },
  { name: "duties", label: "Duties" },
  { name: "otherCosts", label: "Other sourcing cost" },
];

export function calculateDeliveredCost(input: DeliveredCostInput): DeliveredCostResult {
  const conversions: DeliveredCostConversion[] = [];
  const sourcePrice = normalizeComponent(input.sourcePrice);
  const targetCurrency = normalizeCurrency(input.targetCurrency);
  const calculationCurrency = targetCurrency ?? sourcePrice.currency;
  const convertedSourcePrice = convertComponent(
    sourcePrice,
    calculationCurrency,
    input.exchangeRates,
    conversions,
  );
  const sourcePriceInCalculationCurrency = toMoney(
    convertedSourcePrice.convertedAmount,
    calculationCurrency,
  );

  const componentResults = Object.fromEntries(
    COMPONENTS.map(({ name }) => [
      name,
      convertComponent(
        normalizeComponent(input[name]),
        calculationCurrency,
        input.exchangeRates,
        conversions,
      ),
    ]),
  ) as DeliveredCostResult["components"];

  const providerDeliveredCost = input.providerDeliveredCost
    ? convertComponent(
        normalizeComponent(input.providerDeliveredCost),
        calculationCurrency,
        input.exchangeRates,
        conversions,
      )
    : null;

  const sourcePriceUnavailable =
    sourcePrice.amount === null || sourcePrice.currency === null || calculationCurrency === null;
  const sourcePriceCurrencyMismatch =
    !sourcePriceUnavailable && sourcePriceInCalculationCurrency === null;
  const hasCurrencyMismatch =
    sourcePriceCurrencyMismatch ||
    (!sourcePriceUnavailable &&
      (Object.values(componentResults).some(
        (component) => component.amount !== null && component.convertedAmount === null,
      ) ||
        (providerDeliveredCost !== null &&
          providerDeliveredCost.amount !== null &&
          providerDeliveredCost.convertedAmount === null)));
  const missingComponents = COMPONENTS.filter(
    ({ name }) => componentResults[name].amount === null,
  ).map(({ label }) => label);
  const hasUsableComponentCurrency = Object.values(componentResults).some(
    (component) => component.amount !== null && component.convertedAmount === null,
  );

  const knownAdditionalCost = calculateKnownAdditionalCost(
    componentResults,
    calculationCurrency,
    hasUsableComponentCurrency,
  );
  const providerIncludesAll = input.providerDeliveredCost?.includes === "all";
  const allocationQuantity = normalizeQuantity(input.quantity);
  const convertedAdditionalCost = Object.values(componentResults).reduce(
    (sum, component) => sum + (component.convertedAmount ?? 0),
    0,
  );
  const estimatedDeliveredCost =
    providerIncludesAll &&
    providerDeliveredCost !== null &&
    providerDeliveredCost.convertedAmount !== null
      ? toMoney(providerDeliveredCost.convertedAmount, calculationCurrency)
      : sourcePriceInCalculationCurrency && !hasUsableComponentCurrency
        ? toMoney(
            sourcePriceInCalculationCurrency.amount * allocationQuantity + convertedAdditionalCost,
            calculationCurrency,
          )
        : null;
  const estimatedDeliveredUnitCost =
    providerIncludesAll &&
    providerDeliveredCost !== null &&
    providerDeliveredCost.convertedAmount !== null
      ? toMoney(providerDeliveredCost.convertedAmount / allocationQuantity, calculationCurrency)
      : sourcePriceInCalculationCurrency && !hasUsableComponentCurrency
        ? toMoney(
            sourcePriceInCalculationCurrency.amount + convertedAdditionalCost / allocationQuantity,
            calculationCurrency,
          )
        : null;

  const completeness: DeliveredCostCompleteness = sourcePriceUnavailable
    ? "unavailable"
    : hasCurrencyMismatch
      ? "currency_mismatch"
      : providerIncludesAll &&
          providerDeliveredCost !== null &&
          providerDeliveredCost.convertedAmount !== null
        ? providerDeliveredCost.state === "estimated"
          ? "partial"
          : "complete"
        : missingComponents.length > 0
          ? "partial"
          : "complete";

  return {
    sourcePrice: convertedSourcePrice,
    sourcePriceInCalculationCurrency,
    calculationCurrency,
    components: componentResults,
    knownAdditionalCost,
    estimatedDeliveredCost,
    estimatedDeliveredUnitCost,
    completeness,
    missingComponents:
      providerIncludesAll && providerDeliveredCost?.convertedAmount !== null
        ? []
        : missingComponents,
    isEstimate:
      completeness !== "complete" ||
      sourcePrice.state === "estimated" ||
      Object.values(componentResults).some((component) => component.state === "estimated") ||
      providerDeliveredCost?.state === "estimated",
    conversions,
    providerDeliveredCost,
  };
}

function calculateKnownAdditionalCost(
  components: DeliveredCostResult["components"],
  currency: string | null,
  hasUnusableComponent: boolean,
) {
  if (!currency || hasUnusableComponent) return null;
  return {
    amount: roundMoney(
      Object.values(components).reduce(
        (sum, component) =>
          sum + (component.state === "known" ? (component.convertedAmount ?? 0) : 0),
        0,
      ),
    ),
    currency,
  };
}

function normalizeQuantity(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : 1;
}

function normalizeComponent(input: DeliveredCostComponentInput | null | undefined) {
  const parsedAmount =
    typeof input?.amount === "number" && Number.isFinite(input.amount) ? input.amount : null;
  const currency = normalizeCurrency(input?.currency);
  const state =
    parsedAmount === null || input?.state === "unknown"
      ? ("unknown" as const)
      : (input?.state ?? "known");
  return {
    amount: state === "unknown" ? null : parsedAmount,
    currency,
    state,
    source:
      input?.source ?? (state === "unknown" ? ("unknown" as const) : ("marketplace" as const)),
    convertedAmount: null,
    convertedCurrency: null,
  } satisfies DeliveredCostComponent;
}

function convertComponent(
  component: DeliveredCostComponent,
  targetCurrency: string | null,
  exchangeRates: ReadonlyMap<string, ExchangeRate> | undefined,
  conversions: DeliveredCostConversion[],
) {
  if (component.amount === null || component.currency === null || !targetCurrency) {
    return component;
  }
  if (component.currency === targetCurrency) {
    return { ...component, convertedAmount: component.amount, convertedCurrency: targetCurrency };
  }

  const exchangeRate = exchangeRates?.get(`${component.currency}:${targetCurrency}`);
  if (!exchangeRate || !isValidExchangeRate(exchangeRate, component.currency, targetCurrency)) {
    return component;
  }

  if (!conversions.some((conversion) => conversion.fromCurrency === component.currency)) {
    conversions.push({ ...exchangeRate });
  }
  return {
    ...component,
    convertedAmount: roundMoney(component.amount * exchangeRate.rate),
    convertedCurrency: targetCurrency,
  };
}

function isValidExchangeRate(exchangeRate: ExchangeRate, fromCurrency: string, toCurrency: string) {
  return (
    exchangeRate.fromCurrency.toUpperCase() === fromCurrency &&
    exchangeRate.toCurrency.toUpperCase() === toCurrency &&
    Number.isFinite(exchangeRate.rate) &&
    exchangeRate.rate > 0 &&
    Boolean(exchangeRate.observedAt) &&
    Boolean(exchangeRate.source)
  );
}

function toMoney(amount: number | null, currency: string | null): DeliveredCostMoney | null {
  return amount === null || !currency ? null : { amount: roundMoney(amount), currency };
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
