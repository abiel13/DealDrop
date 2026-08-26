import { View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";
import type { ApiProductRecommendation } from "@/services/api";

export function RecommendationCard({
  recommendation,
}: {
  recommendation: ApiProductRecommendation;
}) {
  const decisionLabel = recommendation.decision
    ? recommendation.decision === "buy_now"
      ? "Buy now"
      : recommendation.decision === "wait"
        ? "Wait"
        : "Skip"
    : "Insufficient data";
  const decisionClass =
    recommendation.decision === "buy_now"
      ? "text-primary"
      : recommendation.decision === "wait"
        ? "text-warning"
        : recommendation.decision === "skip"
          ? "text-error"
          : "text-text-secondary";
  const metrics = [
    metric("Current", recommendation.supportingMetrics.currentPrice),
    metric("Delivered", recommendation.supportingMetrics.deliveredUnitCost),
    metric("Observed median", recommendation.supportingMetrics.historicalMedian),
    metric("Observed average", recommendation.supportingMetrics.historicalAverage),
    metric("Target", recommendation.supportingMetrics.targetPrice),
    metric("Maximum", recommendation.supportingMetrics.maximumPrice),
    recommendation.supportingMetrics.cheapestAlternative
      ? `Alternative: ${recommendation.supportingMetrics.cheapestAlternative.source} ${formatMoney(recommendation.supportingMetrics.cheapestAlternative)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <Card padding="md" className="gap-3 bg-primary-soft">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <AppText
            variant="caption"
            className="font-semibold uppercase tracking-[1px] text-primary"
          >
            DealDrop Intelligence
          </AppText>
          <AppText variant="heading" className={decisionClass}>
            {decisionLabel}
          </AppText>
        </View>
        <AppText variant="caption" className="capitalize text-text-secondary">
          {confidenceLabel(recommendation.confidence)}
        </AppText>
      </View>

      <AppText variant="bodySmall">{recommendation.explanation}</AppText>

      {metrics.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {metrics.map((value) => (
            <View key={value} className="rounded-full bg-surface px-3 py-2">
              <AppText variant="caption">{value}</AppText>
            </View>
          ))}
        </View>
      )}

      <View className="gap-2 border-t border-primary/20 pt-2">
        {recommendation.factors.slice(0, 4).map((factor) => (
          <View key={factor.key} className="gap-0.5">
            <AppText variant="caption" className="font-semibold">
              {factor.label}
            </AppText>
            <AppText variant="caption" className="text-text-secondary">
              {factor.detail}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function metric(label: string, value: { amount: number; currency: string } | null) {
  return value ? `${label}: ${formatMoney(value)}` : null;
}

function formatMoney(value: { amount: number; currency: string }) {
  return `${value.currency} ${value.amount.toFixed(2)}`;
}

function confidenceLabel(value: ApiProductRecommendation["confidence"]) {
  return value === "insufficient_data" ? "Insufficient data" : `${value} recommendation`;
}
