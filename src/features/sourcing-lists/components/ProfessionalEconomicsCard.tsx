import { View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";
import type { ApiProfessionalEconomics } from "@/services/api";

export function ProfessionalEconomicsCard({
  economics,
}: {
  economics: ApiProfessionalEconomics | null | undefined;
}) {
  if (!economics) return null;

  const rows = [
    row("Expected buy cost", economics.expectedBuyUnitCost),
    row("Landed cost / unit", economics.landedUnitCost),
    row("Known additional cost", economics.knownAdditionalCost),
    row("Expected resale / unit", economics.expectedSalePrice),
    row("Resale fees total", economics.resaleFeesTotal),
    row("Estimated profit total", economics.estimatedProfitTotal),
    row("Estimated profit / unit", economics.estimatedProfitPerUnit),
    economics.roiPercent === null ? null : `ROI: ${economics.roiPercent.toFixed(2)}%`,
    economics.marginPercent === null ? null : `Margin: ${economics.marginPercent.toFixed(2)}%`,
    economics.desiredRoiPercent === null
      ? null
      : `Desired ROI: ${economics.desiredRoiPercent.toFixed(2)}%`,
    economics.desiredMarginPercent === null
      ? null
      : `Desired margin: ${economics.desiredMarginPercent.toFixed(2)}%`,
    row("Maximum buy price / unit", economics.maximumBuyPrice),
  ].filter((value): value is string => Boolean(value));

  return (
    <Card padding="sm" className="gap-2 bg-primary-soft">
      <View className="flex-row items-center justify-between gap-2">
        <AppText variant="label">Pro profit intelligence</AppText>
        <AppText variant="caption">Estimate</AppText>
      </View>
      <AppText variant="caption" className="text-text-secondary">
        {basisLabel(economics.basis)} · based on the assumptions you entered
      </AppText>

      {economics.completeness === "unavailable" ? (
        <AppText variant="bodySmall">
          Profit, ROI, margin, and maximum buy price are unavailable until expected resale price,
          resale fees, and complete cost inputs are provided.
        </AppText>
      ) : economics.completeness === "currency_mismatch" ? (
        <AppText variant="bodySmall" className="text-error">
          These calculations are unavailable because the configured values use different currencies.
          No conversion was applied.
        </AppText>
      ) : (
        <>
          {rows.length > 0 && (
            <View className="gap-1">
              {rows.map((value) => (
                <AppText key={value} variant="bodySmall">
                  {value}
                </AppText>
              ))}
            </View>
          )}
          {economics.completeness === "partial" && (
            <AppText variant="bodySmall" className="text-warning">
              Still needed: {economics.missingComponents.join(", ") || "more complete cost data"}.
              No incomplete profit or return value is presented as final.
            </AppText>
          )}
        </>
      )}
    </Card>
  );
}

function row(label: string, value: { amount: number; currency: string } | null) {
  return value ? `${label}: ${value.currency} ${value.amount.toFixed(2)}` : null;
}

function basisLabel(basis: ApiProfessionalEconomics["basis"]) {
  return basis === "marketplace_offer"
    ? "Selected marketplace offer"
    : "Configured expected buy cost";
}
