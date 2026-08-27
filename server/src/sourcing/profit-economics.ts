export type ProfessionalEconomicsBasis = "configured_expected_buy_cost" | "marketplace_offer";

export type ProfessionalEconomicsCompleteness =
  "complete" | "partial" | "currency_mismatch" | "unavailable";

export interface ProfessionalEconomicsInput {
  basis: ProfessionalEconomicsBasis;
  quantity: number;
  expectedBuyUnitCost: number | null;
  expectedBuyCurrency: string | null;
  providedLandedUnitCost?: number | null;
  providedLandedUnitCostCurrency?: string | null;
  providedLandedCostCompleteness?:
    "complete" | "partial" | "currency_mismatch" | "unavailable" | null;
  estimatedShippingCost: number | null;
  estimatedShippingCurrency: string | null;
  estimatedDutiesTaxes: number | null;
  estimatedDutiesTaxesCurrency: string | null;
  otherSourcingCost: number | null;
  otherSourcingCostCurrency: string | null;
  expectedSalePrice: number | null;
  expectedSalePriceCurrency: string | null;
  resaleFeesTotal: number | null;
  resaleFeesCurrency: string | null;
  desiredRoiPercent: number | null;
  desiredMarginPercent: number | null;
}

export interface ProfessionalEconomicsMoney {
  amount: number;
  currency: string;
}

export interface ProfessionalEconomicsResult {
  basis: ProfessionalEconomicsBasis;
  quantity: number;
  currency: string | null;
  expectedBuyUnitCost: ProfessionalEconomicsMoney | null;
  landedUnitCost: ProfessionalEconomicsMoney | null;
  knownAdditionalCost: ProfessionalEconomicsMoney | null;
  resaleFeesTotal: ProfessionalEconomicsMoney | null;
  expectedSalePrice: ProfessionalEconomicsMoney | null;
  estimatedProfitTotal: ProfessionalEconomicsMoney | null;
  estimatedProfitPerUnit: ProfessionalEconomicsMoney | null;
  roiPercent: number | null;
  marginPercent: number | null;
  maximumBuyPrice: ProfessionalEconomicsMoney | null;
  desiredRoiPercent: number | null;
  desiredMarginPercent: number | null;
  completeness: ProfessionalEconomicsCompleteness;
  missingComponents: string[];
  isEstimate: boolean;
}

interface CostInput {
  label: string;
  amount: number | null;
  currency: string | null;
}

export function calculateProfessionalEconomics(
  input: ProfessionalEconomicsInput,
): ProfessionalEconomicsResult {
  const quantity = normalizeQuantity(input.quantity);
  const expectedBuyUnitCost = money(input.expectedBuyUnitCost, input.expectedBuyCurrency);
  const expectedSalePrice = money(input.expectedSalePrice, input.expectedSalePriceCurrency);
  const resaleFeesTotal = money(input.resaleFeesTotal, input.resaleFeesCurrency);
  const additionalCosts: CostInput[] = [
    {
      label: "Shipping",
      amount: input.estimatedShippingCost,
      currency: input.estimatedShippingCurrency,
    },
    {
      label: "Duties/taxes",
      amount: input.estimatedDutiesTaxes,
      currency: input.estimatedDutiesTaxesCurrency,
    },
    {
      label: "Other sourcing cost",
      amount: input.otherSourcingCost,
      currency: input.otherSourcingCostCurrency,
    },
  ];
  const knownAdditionalCosts = additionalCosts.filter(
    (component): component is CostInput & { amount: number; currency: string } =>
      component.amount !== null && component.currency !== null,
  );
  const configuredKnownAdditionalCost = sumAdditionalCosts(knownAdditionalCosts);
  const providedLandedUnitCost =
    input.providedLandedCostCompleteness === "complete"
      ? money(input.providedLandedUnitCost ?? null, input.providedLandedUnitCostCurrency ?? null)
      : null;
  const manualLandedUnitCost =
    providedLandedUnitCost === null &&
    quantity !== null &&
    expectedBuyUnitCost !== null &&
    knownAdditionalCosts.length === additionalCosts.length
      ? calculateManualLandedCost(quantity, expectedBuyUnitCost, knownAdditionalCosts)
      : null;
  const landedUnitCost = providedLandedUnitCost ?? manualLandedUnitCost;
  const knownAdditionalCost =
    configuredKnownAdditionalCost ??
    (providedLandedUnitCost &&
    expectedBuyUnitCost &&
    providedLandedUnitCost.currency === expectedBuyUnitCost.currency
      ? money(
          Math.max(0, providedLandedUnitCost.amount - expectedBuyUnitCost.amount),
          providedLandedUnitCost.currency,
        )
      : null);
  const currencies = new Set<string>();
  for (const component of knownAdditionalCosts) {
    currencies.add(component.currency);
  }
  for (const value of [
    landedUnitCost?.currency,
    expectedSalePrice?.currency,
    resaleFeesTotal?.currency,
    knownAdditionalCost?.currency,
  ]) {
    if (value) currencies.add(value);
  }
  const currencyMismatch = currencies.size > 1;
  const calculationCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  const missingComponents = missingComponentsFor(
    quantity,
    expectedBuyUnitCost,
    landedUnitCost,
    expectedSalePrice,
    resaleFeesTotal,
    additionalCosts,
    input.providedLandedCostCompleteness,
  );
  if (currencyMismatch) missingComponents.push("Currency conversion");

  const comparableCosts =
    !currencyMismatch &&
    quantity !== null &&
    landedUnitCost !== null &&
    expectedSalePrice !== null &&
    resaleFeesTotal !== null &&
    landedUnitCost.currency === expectedSalePrice.currency &&
    resaleFeesTotal.currency === expectedSalePrice.currency;
  const estimatedProfitTotal = comparableCosts
    ? money(
        expectedSalePrice.amount * quantity -
          resaleFeesTotal.amount -
          landedUnitCost.amount * quantity,
        expectedSalePrice.currency,
      )
    : null;
  const estimatedProfitPerUnit =
    estimatedProfitTotal && quantity !== null
      ? money(estimatedProfitTotal.amount / quantity, estimatedProfitTotal.currency)
      : null;
  const acquisitionTotal =
    comparableCosts && quantity !== null ? landedUnitCost.amount * quantity : null;
  const roiPercent =
    estimatedProfitTotal !== null && acquisitionTotal !== null && acquisitionTotal > 0
      ? roundPercent((estimatedProfitTotal.amount / acquisitionTotal) * 100)
      : null;
  const marginPercent =
    estimatedProfitTotal !== null && expectedSalePrice !== null && expectedSalePrice.amount > 0
      ? roundPercent((estimatedProfitTotal.amount / (expectedSalePrice.amount * quantity!)) * 100)
      : null;
  const maximumBuyPrice = calculateMaximumBuyPrice(
    quantity,
    expectedSalePrice,
    resaleFeesTotal,
    knownAdditionalCost,
    input.desiredRoiPercent,
    input.desiredMarginPercent,
    currencyMismatch,
    providedLandedUnitCost !== null || knownAdditionalCosts.length === additionalCosts.length,
  );
  const hasInputs =
    expectedBuyUnitCost !== null ||
    expectedSalePrice !== null ||
    resaleFeesTotal !== null ||
    knownAdditionalCosts.length > 0 ||
    input.desiredRoiPercent !== null ||
    input.desiredMarginPercent !== null;

  return {
    basis: input.basis,
    quantity: quantity ?? input.quantity,
    currency: calculationCurrency,
    expectedBuyUnitCost,
    landedUnitCost,
    knownAdditionalCost,
    resaleFeesTotal,
    expectedSalePrice,
    estimatedProfitTotal,
    estimatedProfitPerUnit,
    roiPercent,
    marginPercent,
    maximumBuyPrice,
    desiredRoiPercent: input.desiredRoiPercent,
    desiredMarginPercent: input.desiredMarginPercent,
    completeness: currencyMismatch
      ? "currency_mismatch"
      : comparableCosts
        ? "complete"
        : hasInputs
          ? "partial"
          : "unavailable",
    missingComponents: [...new Set(missingComponents)],
    isEstimate: true,
  };
}

function calculateManualLandedCost(
  quantity: number,
  expectedBuyUnitCost: ProfessionalEconomicsMoney,
  additionalCosts: Array<CostInput & { amount: number; currency: string }>,
) {
  const currencies = new Set([
    expectedBuyUnitCost.currency,
    ...additionalCosts.map((item) => item.currency),
  ]);
  if (currencies.size !== 1) return null;
  const additionalTotal = additionalCosts.reduce((total, item) => total + item.amount, 0);
  return money(
    expectedBuyUnitCost.amount + additionalTotal / quantity,
    expectedBuyUnitCost.currency,
  );
}

function calculateMaximumBuyPrice(
  quantity: number | null,
  expectedSalePrice: ProfessionalEconomicsMoney | null,
  resaleFeesTotal: ProfessionalEconomicsMoney | null,
  knownAdditionalCost: ProfessionalEconomicsMoney | null,
  desiredRoiPercent: number | null,
  desiredMarginPercent: number | null,
  currencyMismatch: boolean,
  additionalCostsComplete: boolean,
) {
  if (
    currencyMismatch ||
    !additionalCostsComplete ||
    quantity === null ||
    expectedSalePrice === null ||
    resaleFeesTotal === null ||
    knownAdditionalCost === null ||
    expectedSalePrice.currency !== resaleFeesTotal.currency ||
    expectedSalePrice.currency !== knownAdditionalCost.currency
  ) {
    return null;
  }

  const netRevenue = expectedSalePrice.amount * quantity - resaleFeesTotal.amount;
  const acquisitionLimits: number[] = [];
  if (desiredRoiPercent !== null) {
    acquisitionLimits.push(netRevenue / (1 + desiredRoiPercent / 100));
  }
  if (desiredMarginPercent !== null) {
    acquisitionLimits.push(
      expectedSalePrice.amount * quantity * (1 - desiredMarginPercent / 100) -
        resaleFeesTotal.amount,
    );
  }
  if (acquisitionLimits.length === 0) return null;

  return money(
    Math.max(0, (Math.min(...acquisitionLimits) - knownAdditionalCost.amount) / quantity),
    expectedSalePrice.currency,
  );
}

function missingComponentsFor(
  quantity: number | null,
  expectedBuyUnitCost: ProfessionalEconomicsMoney | null,
  landedUnitCost: ProfessionalEconomicsMoney | null,
  expectedSalePrice: ProfessionalEconomicsMoney | null,
  resaleFeesTotal: ProfessionalEconomicsMoney | null,
  additionalCosts: CostInput[],
  providedLandedCostCompleteness: ProfessionalEconomicsInput["providedLandedCostCompleteness"],
) {
  const missing: string[] = [];
  if (quantity === null) missing.push("Quantity");
  if (landedUnitCost === null) {
    if (expectedBuyUnitCost === null) missing.push("Expected buy cost");
    for (const component of additionalCosts) {
      if (component.amount === null || component.currency === null) missing.push(component.label);
    }
    if (providedLandedCostCompleteness && providedLandedCostCompleteness !== "complete") {
      missing.push("Complete delivered cost");
    }
  }
  if (expectedSalePrice === null) missing.push("Expected sale price");
  if (resaleFeesTotal === null) missing.push("Resale fees");
  return [...new Set(missing)];
}

function sumAdditionalCosts(costs: Array<CostInput & { amount: number; currency: string }>) {
  if (costs.length === 0) return null;
  const currencies = new Set(costs.map((item) => item.currency));
  if (currencies.size !== 1) return null;
  return money(
    costs.reduce((total, item) => total + item.amount, 0),
    costs[0]!.currency,
  );
}

function money(amount: number | null, currency: string | null): ProfessionalEconomicsMoney | null {
  const normalizedCurrency = normalizeCurrency(currency);
  return amount !== null && Number.isFinite(amount) && normalizedCurrency
    ? { amount: roundMoney(amount), currency: normalizedCurrency }
    : null;
}

function normalizeQuantity(value: number) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeCurrency(value: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
