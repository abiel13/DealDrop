import { Image, Linking, Pressable, View } from "react-native";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AppText } from "@/components/ui/Text";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";
import type { ApiAlternativeOffer, ApiDeliveredCost, ApiListingAlternatives } from "@/services/api";

export function ProductAlternativesCard({
  alternatives,
  onTrackAlternative,
  trackingOfferId,
}: {
  alternatives: ApiListingAlternatives;
  onTrackAlternative: (offer: ApiAlternativeOffer) => void;
  trackingOfferId: string | null;
}) {
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const selectedOffers = alternatives.alternatives.filter((offer) =>
    selectedOfferIds.includes(offer.offerId),
  );

  if (alternatives.sources.length === 0 && alternatives.partialFailures.length === 0) {
    return null;
  }

  return (
    <Card padding="md" className="gap-4">
      <View className="gap-1">
        <AppText variant="title">Cross-marketplace alternatives</AppText>
        <AppText variant="bodySmall" className="text-text-secondary">
          DealDrop checked other enabled marketplaces and kept uncertain variants out of this list.
        </AppText>
      </View>

      {alternatives.alternatives.length === 0 ? (
        <AppText variant="bodySmall">
          No confidently equivalent offer was found for this product. Similar-looking products are
          not shown as alternatives.
        </AppText>
      ) : (
        <>
          <View className="flex-row items-center justify-between gap-3">
            <AppText variant="caption" className="text-text-secondary">
              {alternatives.alternatives.length} equivalent offer
              {alternatives.alternatives.length === 1 ? "" : "s"} · ranked by delivered cost and
              purchase context
            </AppText>
            {selectedOffers.length >= 2 ? (
              <Button size="sm" variant="secondary" onPress={() => setCompareOpen(true)}>
                Compare selected
              </Button>
            ) : (
              <AppText variant="caption" className="text-primary">
                Select 2+ to compare
              </AppText>
            )}
          </View>

          {compareOpen && selectedOffers.length >= 2 && (
            <View className="gap-3 rounded-2xl bg-primary-soft p-3">
              <View className="flex-row items-center justify-between gap-3">
                <AppText variant="label">Selected alternatives</AppText>
                <Button size="sm" variant="ghost" onPress={() => setCompareOpen(false)}>
                  Close
                </Button>
              </View>
              {selectedOffers.map((offer) => (
                <View
                  key={offer.offerId}
                  className="gap-1 border-b border-primary/20 pb-2 last:border-b-0 last:pb-0"
                >
                  <AppText variant="bodySmall" className="font-semibold">
                    {formatMarketplaceName(offer.source)} ·{" "}
                    {offer.sellerName ?? "Seller unavailable"}
                  </AppText>
                  <AppText variant="caption">
                    Marketplace price: {formatMoney(offer.price, offer.currency)} · Delivered:{" "}
                    {formatDeliveredCost(
                      offer.cost,
                      offer.landedUnitCost,
                      offer.landedUnitCostCurrency,
                    )}
                  </AppText>
                  <AppText variant="caption">
                    {offer.condition ?? "Condition unavailable"} · {offer.url}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          {alternatives.alternatives.map((offer) => {
            const selected = selectedOfferIds.includes(offer.offerId);
            const isTracking = trackingOfferId === offer.offerId;
            return (
              <Pressable
                key={offer.offerId}
                className={`gap-3 rounded-2xl border p-4 ${selected ? "border-primary bg-primary-soft" : "border-border bg-surface-muted"}`}
                onPress={() =>
                  setSelectedOfferIds((current) =>
                    selected
                      ? current.filter((id) => id !== offer.offerId)
                      : [...current, offer.offerId],
                  )
                }
              >
                <View className="flex-row items-start gap-3">
                  {offer.imageUrl ? (
                    <Image
                      source={{ uri: offer.imageUrl }}
                      className="h-16 w-16 rounded-xl bg-background-muted"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-16 w-16 rounded-xl bg-background-muted" />
                  )}
                  <View className="flex-1 gap-1">
                    <View className="flex-row items-start justify-between gap-2">
                      <AppText variant="label" className="flex-1">
                        #{offer.rank} · {formatMarketplaceName(offer.source)}
                      </AppText>
                      <AppText variant="caption" className="text-primary">
                        {offer.variantMatch === "exact" ? "Exact match" : "Strong match"}
                      </AppText>
                    </View>
                    <AppText variant="bodySmall">
                      {offer.sellerName ?? "Seller unavailable"}
                    </AppText>
                    <AppText variant="caption">{offer.title}</AppText>
                  </View>
                </View>

                <View className="flex-row flex-wrap gap-2">
                  {offer.alternativeReasons.slice(0, 4).map((reason) => (
                    <View
                      key={`${offer.offerId}-${reason.code}`}
                      className="rounded-full bg-surface px-2.5 py-1"
                    >
                      <AppText variant="caption" className="text-primary">
                        {reason.label}
                      </AppText>
                    </View>
                  ))}
                </View>

                <View className="gap-1">
                  <AppText variant="bodySmall">
                    Marketplace price: {formatMoney(offer.price, offer.currency)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Delivered cost:{" "}
                    {formatDeliveredCost(
                      offer.cost,
                      offer.landedUnitCost,
                      offer.landedUnitCostCurrency,
                    )}
                  </AppText>
                  <AppText variant="bodySmall">
                    {offer.condition ?? "Condition unavailable"} ·{" "}
                    {offer.availability ?? "Availability unavailable"}
                  </AppText>
                </View>

                <View className="gap-2">
                  {offer.alternativeReasons.slice(0, 3).map((reason) => (
                    <View key={`${offer.offerId}-${reason.code}-detail`} className="gap-0.5">
                      <AppText variant="caption" className="font-semibold">
                        {reason.label}
                      </AppText>
                      <AppText variant="caption" className="text-text-secondary">
                        {reason.detail}
                      </AppText>
                    </View>
                  ))}
                </View>

                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    variant={selected ? "secondary" : "outline"}
                    className="flex-1 px-2"
                    onPress={(event) => {
                      event.stopPropagation();
                      setSelectedOfferIds((current) =>
                        selected
                          ? current.filter((id) => id !== offer.offerId)
                          : [...current, offer.offerId],
                      );
                    }}
                  >
                    {selected ? "Selected" : "Compare"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 px-2"
                    onPress={(event) => {
                      event.stopPropagation();
                      setLinkError(null);
                      void Linking.openURL(offer.url).catch(() => {
                        setLinkError("This marketplace link could not be opened.");
                      });
                    }}
                  >
                    Open source
                  </Button>
                </View>
                <Button
                  size="sm"
                  loading={isTracking}
                  onPress={(event) => {
                    event.stopPropagation();
                    onTrackAlternative(offer);
                  }}
                >
                  Track this alternative
                </Button>
              </Pressable>
            );
          })}
        </>
      )}

      {alternatives.partialFailures.length > 0 && (
        <View className="gap-1 rounded-2xl bg-background-muted p-3">
          <AppText variant="caption" className="font-semibold">
            Some marketplaces could not be checked
          </AppText>
          {alternatives.partialFailures.map((failure) => (
            <AppText key={`${failure.source}-${failure.category}`} variant="caption">
              {formatMarketplaceName(failure.source)}: {failure.message}
            </AppText>
          ))}
        </View>
      )}
      {linkError && <AppText variant="error">{linkError}</AppText>}
    </Card>
  );
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return "Unknown";
  return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

function formatDeliveredCost(
  cost: ApiDeliveredCost | undefined,
  landedUnitCost: number | null,
  landedUnitCostCurrency: string | null,
) {
  const value = formatMoney(
    cost?.estimatedDeliveredUnitCost?.amount ?? landedUnitCost,
    cost?.estimatedDeliveredUnitCost?.currency ?? landedUnitCostCurrency,
  );
  if (!cost || cost.completeness === "complete" || cost.missingComponents.length === 0) {
    return value;
  }

  return `${value} (partial; ${cost.missingComponents.join(", ")} not included)`;
}
