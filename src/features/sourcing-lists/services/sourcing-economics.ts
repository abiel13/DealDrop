export interface SourcingEconomicsInput {
  quantity: number;
  marketplacePrice: number | null;
  marketplaceCurrency: string | null;
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
}

export interface SourcingEconomicsResult {
  currency: string | null;
  estimatedLandedUnitCost: number | null;
  estimatedTotalAcquisitionCost: number | null;
  estimatedGrossMarginPerUnit: number | null;
  estimatedGrossMarginPercent: number | null;
  unknownComponents: string[];
  costCurrencyMismatch: boolean;
  currencyMismatch: boolean;
  minimumMarginMet: boolean | null;
  maxLandedCostMet: boolean | null;
  isEstimate: boolean;
}

interface CostComponent {
  label: string;
  amount: number | null;
  currency: string | null;
}

export function calculateSourcingEconomics(input: SourcingEconomicsInput): SourcingEconomicsResult {
  const components: CostComponent[] = [
    {
      label: "Marketplace price",
      amount: input.marketplacePrice,
      currency: input.marketplaceCurrency,
    },
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
  const unknownComponents = components.flatMap((component) => {
    if (component.amount === null || component.amount === undefined) {
      return [component.label];
    }
    return component.currency ? [] : [`${component.label} currency`];
  });
  const costCurrencies = components
    .filter((component) => component.amount !== null && component.currency)
    .map((component) => component.currency!.trim().toUpperCase());
  const comparisonCurrencies = [
    ...costCurrencies,
    ...(input.desiredRetailPrice !== null && input.desiredRetailPriceCurrency
      ? [input.desiredRetailPriceCurrency.trim().toUpperCase()]
      : []),
    ...(input.maxLandedUnitCost !== null && input.maxLandedUnitCostCurrency
      ? [input.maxLandedUnitCostCurrency.trim().toUpperCase()]
      : []),
  ];
  const currencies = new Set(
    components
      .filter((component) => component.amount !== null && component.currency)
      .map((component) => component.currency!.trim().toUpperCase()),
  );
  const costCurrencyMismatch = currencies.size > 1;
  const currencyMismatch = new Set(comparisonCurrencies).size > 1;
  const currency = currencies.size === 1 ? [...currencies][0]! : null;
  const complete = unknownComponents.length === 0 && !costCurrencyMismatch && input.quantity > 0;
  const estimatedLandedUnitCost = complete
    ? roundMoney(
        input.marketplacePrice! +
          (input.estimatedShippingCost! + input.estimatedDutiesTaxes! + input.otherSourcingCost!) /
            input.quantity,
      )
    : null;
  const estimatedTotalAcquisitionCost =
    estimatedLandedUnitCost === null ? null : roundMoney(estimatedLandedUnitCost * input.quantity);
  const retailPriceMatches =
    input.desiredRetailPrice !== null &&
    input.desiredRetailPriceCurrency !== null &&
    currency !== null &&
    input.desiredRetailPriceCurrency.trim().toUpperCase() === currency;
  const estimatedGrossMarginPerUnit =
    estimatedLandedUnitCost !== null && retailPriceMatches
      ? roundMoney(input.desiredRetailPrice! - estimatedLandedUnitCost)
      : null;
  const estimatedGrossMarginPercent =
    estimatedGrossMarginPerUnit !== null && input.desiredRetailPrice! > 0
      ? roundPercent((estimatedGrossMarginPerUnit / input.desiredRetailPrice!) * 100)
      : null;

  return {
    currency,
    estimatedLandedUnitCost,
    estimatedTotalAcquisitionCost,
    estimatedGrossMarginPerUnit,
    estimatedGrossMarginPercent,
    unknownComponents,
    costCurrencyMismatch,
    currencyMismatch,
    minimumMarginMet:
      estimatedGrossMarginPercent === null || input.minimumDesiredMarginPercent === null
        ? null
        : estimatedGrossMarginPercent >= input.minimumDesiredMarginPercent,
    maxLandedCostMet:
      estimatedLandedUnitCost === null ||
      input.maxLandedUnitCost === null ||
      !input.maxLandedUnitCostCurrency ||
      !currency ||
      input.maxLandedUnitCostCurrency.trim().toUpperCase() !== currency
        ? null
        : estimatedLandedUnitCost <= input.maxLandedUnitCost,
    isEstimate: true,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
