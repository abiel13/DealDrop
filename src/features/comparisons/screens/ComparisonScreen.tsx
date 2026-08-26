import { Linking, Pressable, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { createSupplier } from "@/features/suppliers/services/supplier.service";
import {
  createSourcingNote,
  getSourcingNotes,
} from "@/features/sourcing-lists/services/sourcing-list.service";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import { RecommendationCard } from "@/features/intelligence/components/RecommendationCard";
import type {
  ApiDeliveredCostComponent,
  ApiComparisonOffer,
  ApiComparisonShortlist,
  ApiProductComparison,
} from "@/services/api";

import {
  createComparisonManualGroup,
  getComparisonErrorMessage,
  getSourcingProductComparison,
  removeComparisonShortlist,
  shortlistComparisonOffer,
} from "../services/comparison.service";

export function ComparisonScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const params = useLocalSearchParams<{ id?: string; productId?: string }>();
  const sourcingListId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";
  const queryClient = useQueryClient();
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const queryKey = ["sourcing-comparison", workspaceId, sourcingListId, productId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getSourcingProductComparison(workspaceId ?? "", sourcingListId, productId),
    enabled: Boolean(user && workspaceId && sourcingListId && productId),
  });
  const shortlistMutation = useMutation({
    mutationFn: async ({ offer, next }: { offer: ApiComparisonOffer; next: boolean }) => {
      if (next) {
        return shortlistComparisonOffer(workspaceId ?? "", {
          sourcingListProductId: productId,
          offer: { ...offer, isShortlisted: true },
          supplierId: offer.savedSupplier?.id ?? null,
        });
      }

      const saved = query.data?.shortlisted.find((item) => item.offer.offerId === offer.offerId);
      if (!saved) {
        throw new Error("The comparison shortlist was not found.");
      }
      await removeComparisonShortlist(workspaceId ?? "", saved.id);
      return null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: ["sourcing-summary", workspaceId, sourcingListId],
      });
    },
  });
  const saveSupplierMutation = useMutation({
    mutationFn: (offer: ApiComparisonOffer) => {
      if (!offer.sellerName) {
        throw new Error("This offer does not include a seller name.");
      }
      return createSupplier(workspaceId ?? "", {
        name: offer.sellerName,
        marketplace: offer.source,
        marketplaceSellerId: offer.sellerId ?? null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const manualGroupMutation = useMutation({
    mutationFn: () => {
      const offers = selectedOffers(query.data?.comparisons ?? [], selectedOfferIds);
      return createComparisonManualGroup(workspaceId ?? "", {
        sourcingListProductId: productId,
        members: offers.map((offer) => ({ source: offer.source, externalId: offer.externalId })),
      });
    },
    onSuccess: () => {
      setSelectedOfferIds([]);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (query.isLoading) return <Loading />;

  if (query.isError || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Compare sources" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't compare this product"
            description="The sourcing product may have been removed or is not available in this workspace."
          />
          <Button variant="outline" onPress={() => void query.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const comparison = query.data;
  const selectedCount = selectedOfferIds.length;
  const mutationError = shortlistMutation.error ?? manualGroupMutation.error;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-10 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Compare sources"
          subtitle={comparison.sourcingListProduct.productName}
          onBack={() => router.back()}
        />

        <Card padding="md" className="gap-3 bg-primary-soft">
          <View className="flex-row items-end justify-between gap-3">
            <View className="flex-1 gap-1">
              <AppText variant="title">One product, every source</AppText>
              <AppText variant="bodySmall">
                DealDrop keeps each marketplace offer available while grouping only likely matches.
              </AppText>
            </View>
            <AppText className="font-semibold text-primary">
              {comparison.sourcingListProduct.targetQuantity} units
            </AppText>
          </View>
          <AppText variant="caption">Search: {comparison.searchQuery}</AppText>
          <AppText variant="caption">
            Max unit cost:{" "}
            {formatMoney(
              comparison.sourcingListProduct.maxUnitCost,
              comparison.sourcingListProduct.maxUnitCostCurrency,
            )}
            {comparison.sourcingListProduct.preferredCondition
              ? ` · ${comparison.sourcingListProduct.preferredCondition}`
              : ""}
          </AppText>
        </Card>

        {comparison.partialFailures.length > 0 && (
          <Card padding="md" className="gap-2 bg-surface-muted">
            <AppText variant="label">Some sources could not be checked</AppText>
            {comparison.partialFailures.map((failure) => (
              <AppText key={`${failure.source}-${failure.category}`} variant="bodySmall">
                {formatMarketplaceName(failure.source)}: {failure.message}
              </AppText>
            ))}
          </Card>
        )}

        {selectedCount > 0 && (
          <Card padding="md" className="gap-3 bg-surface-muted">
            <AppText variant="bodySmall">
              {selectedCount} offer{selectedCount === 1 ? "" : "s"} selected. Select offers that are
              the same product when DealDrop could not safely match them.
            </AppText>
            <Button
              size="sm"
              loading={manualGroupMutation.isPending}
              disabled={selectedCount < 2}
              onPress={() => manualGroupMutation.mutate()}
            >
              Mark as same product
            </Button>
          </Card>
        )}

        {comparison.comparisons.length === 0 ? (
          <Card padding="md" className="gap-2">
            <AppText variant="title">No comparable offers yet</AppText>
            <AppText variant="bodySmall">
              The selected marketplaces returned no usable offers for this sourcing target.
            </AppText>
          </Card>
        ) : (
          comparison.comparisons.map((group) => (
            <ComparisonGroupCard
              key={group.id}
              group={group}
              shortlisted={comparison.shortlisted}
              workspaceId={workspaceId}
              sourcingListId={sourcingListId}
              productId={productId}
              linkError={linkError}
              selectedOfferIds={selectedOfferIds}
              shortlistPendingOfferId={
                shortlistMutation.isPending ? shortlistMutation.variables?.offer.offerId : null
              }
              saveSupplierPendingOfferId={
                saveSupplierMutation.isPending ? saveSupplierMutation.variables?.offerId : null
              }
              onOpenOffer={(offer) => {
                setLinkError(null);
                void Linking.openURL(offer.url).catch(() => {
                  setLinkError("This source link could not be opened.");
                });
              }}
              onSelectOffer={(offer) => {
                setSelectedOfferIds((current) =>
                  current.includes(offer.offerId)
                    ? current.filter((id) => id !== offer.offerId)
                    : [...current, offer.offerId],
                );
              }}
              onToggleShortlist={(offer) =>
                shortlistMutation.mutate({ offer, next: !offer.isShortlisted })
              }
              onSaveSupplier={(offer) => saveSupplierMutation.mutate(offer)}
            />
          ))
        )}

        {linkError && <AppText variant="error">{linkError}</AppText>}
        {mutationError && (
          <AppText variant="error">{getComparisonErrorMessage(mutationError)}</AppText>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function ComparisonGroupCard({
  group,
  shortlisted,
  workspaceId,
  sourcingListId,
  productId,
  linkError,
  selectedOfferIds,
  shortlistPendingOfferId,
  saveSupplierPendingOfferId,
  onOpenOffer,
  onSelectOffer,
  onToggleShortlist,
  onSaveSupplier,
}: {
  group: ApiProductComparison;
  shortlisted: ApiComparisonShortlist[];
  workspaceId: string | null;
  sourcingListId: string;
  productId: string;
  linkError: string | null;
  selectedOfferIds: string[];
  shortlistPendingOfferId: string | null;
  saveSupplierPendingOfferId: string | null;
  onOpenOffer: (offer: ApiComparisonOffer) => void;
  onSelectOffer: (offer: ApiComparisonOffer) => void;
  onToggleShortlist: (offer: ApiComparisonOffer) => void;
  onSaveSupplier: (offer: ApiComparisonOffer) => void;
}) {
  return (
    <Card padding="md" className="gap-4">
      <View className="gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <AppText variant="title" className="flex-1">
            {group.title}
          </AppText>
          <AppText variant="caption" className="text-primary">
            {group.sources.length} source{group.sources.length === 1 ? "" : "s"}
          </AppText>
        </View>
        <AppText variant="caption">
          {group.matchMethod === "manual"
            ? "Manually marked as the same product"
            : group.matchMethod === "identifier"
              ? "Matched using a product identifier"
              : "Conservative model and title match"}
        </AppText>
      </View>

      {group.recommendation && <RecommendationCard recommendation={group.recommendation} />}

      {group.rawAndLandedWinnersDiffer && (
        <AppText variant="bodySmall" className="font-semibold text-primary">
          The cheapest raw price is not the cheapest estimated landed cost.
        </AppText>
      )}
      {group.currenciesCompared.length > 1 && (
        <AppText variant="bodySmall" className="text-warning">
          Offers use different currencies, so DealDrop has not ranked them against each other.
        </AppText>
      )}

      {group.offers.map((offer) => {
        const isSelected = selectedOfferIds.includes(offer.offerId);
        const isPending = shortlistPendingOfferId === offer.offerId;
        const isRawWinner = group.cheapestRawOfferId === offer.offerId;
        const isLandedWinner = group.cheapestLandedOfferId === offer.offerId;
        const isQualifyingWinner = group.cheapestQualifyingOfferId === offer.offerId;
        const isQualifyingLandedWinner = group.cheapestQualifyingLandedOfferId === offer.offerId;

        return (
          <Pressable
            key={offer.offerId}
            className={`gap-3 rounded-2xl border p-4 ${isSelected ? "border-primary bg-primary-soft" : "border-border bg-surface-muted"}`}
            onPress={() => onSelectOffer(offer)}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <AppText variant="label">{formatMarketplaceName(offer.source)}</AppText>
                <AppText variant="bodySmall">{offer.sellerName ?? "Seller unavailable"}</AppText>
              </View>
              <AppText className="font-semibold text-primary">
                {formatMoney(offer.price, offer.currency)}
              </AppText>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {isRawWinner && <Badge label="Cheapest price" />}
              {isLandedWinner && <Badge label={landedWinnerLabel(offer, false)} />}
              {isQualifyingWinner && <Badge label="Best qualifying price" />}
              {isQualifyingLandedWinner && <Badge label={landedWinnerLabel(offer, true)} />}
              {offer.qualification === "qualifies" && <Badge label="Qualifies" />}
              {offer.qualification === "unknown" && <Badge label="Criteria unknown" muted />}
              {offer.isShortlisted && <Badge label="Shortlisted" />}
              {offer.savedSupplier?.status === "preferred" && <Badge label="Preferred supplier" />}
              {offer.savedSupplier?.status === "avoid" && <Badge label="Avoid supplier" muted />}
              {offer.savedSupplier?.status === "unreviewed" && (
                <Badge label="Saved supplier" muted />
              )}
              {isSelected && <Badge label="Selected" />}
            </View>

            <View className="gap-1">
              {offer.cost ? (
                <>
                  <AppText variant="bodySmall">
                    Marketplace price:{" "}
                    {formatMoney(offer.cost.sourcePrice.amount, offer.cost.sourcePrice.currency)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Shipping: {formatCostComponent(offer.cost.components.shipping)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Marketplace fees: {formatCostComponent(offer.cost.components.buyerFees)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Taxes: {formatCostComponent(offer.cost.components.taxes)} · Duties:{" "}
                    {formatCostComponent(offer.cost.components.duties)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Known additional cost:{" "}
                    {formatMoney(
                      offer.cost.knownAdditionalCost?.amount ?? null,
                      offer.cost.knownAdditionalCost?.currency ?? null,
                    )}
                  </AppText>
                  <AppText variant="bodySmall">
                    Estimated delivered unit cost:{" "}
                    {formatMoney(
                      offer.cost.estimatedDeliveredUnitCost?.amount ?? null,
                      offer.cost.estimatedDeliveredUnitCost?.currency ?? null,
                    )}
                    {costCompletenessLabel(offer.cost)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Estimated delivered total:{" "}
                    {formatMoney(
                      offer.cost.estimatedDeliveredCost?.amount ?? null,
                      offer.cost.estimatedDeliveredCost?.currency ?? null,
                    )}
                  </AppText>
                  {offer.cost.missingComponents.length > 0 && (
                    <AppText variant="caption">
                      Not included: {offer.cost.missingComponents.join(", ")}.
                    </AppText>
                  )}
                </>
              ) : (
                <>
                  <AppText variant="bodySmall">
                    Shipping: {formatMoney(offer.shippingCost, offer.shippingCurrency)}
                  </AppText>
                  <AppText variant="bodySmall">
                    Estimated landed cost:{" "}
                    {formatMoney(offer.landedUnitCost, offer.landedUnitCostCurrency)}
                  </AppText>
                </>
              )}
              <AppText variant="bodySmall">
                Quantity: {offer.availableQuantity === null ? "Unknown" : offer.availableQuantity}
                {offer.condition ? ` · ${offer.condition}` : " · Condition unknown"}
              </AppText>
              {offer.deliveryInformation && (
                <AppText variant="bodySmall">Delivery: {offer.deliveryInformation}</AppText>
              )}
              {offer.qualificationReasons.length > 0 && offer.qualification !== "qualifies" && (
                <AppText variant="caption">{offer.qualificationReasons.join(" ")}</AppText>
              )}
            </View>

            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant={offer.isShortlisted ? "secondary" : "outline"}
                className="flex-1 px-2"
                loading={isPending}
                onPress={(event) => {
                  event.stopPropagation();
                  onToggleShortlist(offer);
                }}
              >
                {offer.isShortlisted ? "Shortlisted" : "Shortlist"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 px-2"
                onPress={(event) => {
                  event.stopPropagation();
                  onOpenOffer(offer);
                }}
              >
                Open source
              </Button>
            </View>
            {!offer.savedSupplier && offer.sellerName && (
              <Button
                size="sm"
                variant="ghost"
                loading={saveSupplierPendingOfferId === offer.offerId}
                onPress={(event) => {
                  event.stopPropagation();
                  onSaveSupplier(offer);
                }}
              >
                Save seller to suppliers
              </Button>
            )}
            {offer.isShortlisted && (
              <ShortlistNotes
                workspaceId={workspaceId ?? ""}
                sourcingListId={sourcingListId}
                productId={productId}
                shortlistId={shortlistIdForOffer(shortlisted, offer.offerId)}
              />
            )}
          </Pressable>
        );
      })}
      {linkError && <AppText variant="error">{linkError}</AppText>}
    </Card>
  );
}

function ShortlistNotes({
  workspaceId,
  sourcingListId,
  productId,
  shortlistId,
}: {
  workspaceId: string;
  sourcingListId: string;
  productId: string;
  shortlistId: string | null;
}) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const notesQuery = useQuery({
    queryKey: ["shortlist-notes", workspaceId, productId, shortlistId],
    queryFn: () =>
      getSourcingNotes(workspaceId, sourcingListId, productId, shortlistId ?? undefined),
    enabled: Boolean(shortlistId),
  });
  const mutation = useMutation({
    mutationFn: () =>
      createSourcingNote(
        workspaceId,
        sourcingListId,
        productId,
        body.trim(),
        shortlistId ?? undefined,
      ),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: ["shortlist-notes", workspaceId, productId, shortlistId],
      });
    },
  });

  if (!shortlistId) return null;
  return (
    <View className="gap-2 border-t border-border pt-2" onStartShouldSetResponder={() => true}>
      <AppText variant="caption">Internal offer notes</AppText>
      {notesQuery.data?.map((note) => (
        <AppText key={note.id} variant="bodySmall">
          {note.authorName ?? "Team member"}: {note.body}
        </AppText>
      ))}
      <Input
        placeholder="Add a note about this offer"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!body.trim()}
        loading={mutation.isPending}
        onPress={(event) => {
          event.stopPropagation();
          mutation.mutate();
        }}
      >
        Add offer note
      </Button>
    </View>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <View
      className={`rounded-full px-2.5 py-1 ${muted ? "bg-background-muted" : "bg-primary-soft"}`}
    >
      <AppText variant="caption" className={muted ? "text-text-secondary" : "text-primary"}>
        {label}
      </AppText>
    </View>
  );
}

function selectedOffers(groups: ApiProductComparison[], selectedOfferIds: string[]) {
  const selected = new Set(selectedOfferIds);
  return groups.flatMap((group) => group.offers.filter((offer) => selected.has(offer.offerId)));
}

function shortlistIdForOffer(shortlisted: ApiComparisonShortlist[], offerId: string) {
  return shortlisted.find((item) => item.offer.offerId === offerId)?.id ?? null;
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return "Unknown";
  return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

function formatCostComponent(component: ApiDeliveredCostComponent) {
  if (component.amount === null) return "Unknown";
  const original = formatMoney(component.amount, component.currency);
  const converted =
    component.convertedAmount !== null && component.convertedCurrency !== component.currency
      ? ` → ${formatMoney(component.convertedAmount, component.convertedCurrency)}`
      : "";
  const estimate = component.state === "estimated" ? " (estimate)" : "";
  return `${original}${converted}${estimate}`;
}

function costCompletenessLabel(cost: NonNullable<ApiComparisonOffer["cost"]>) {
  if (cost.completeness === "complete") {
    return cost.isEstimate ? " · complete using estimates" : " · complete";
  }
  if (cost.completeness === "currency_mismatch") return " · currency conversion unavailable";
  if (cost.completeness === "unavailable") return " · unavailable";
  return " · partial estimate";
}

function landedWinnerLabel(offer: ApiComparisonOffer, qualifying: boolean) {
  if (offer.cost?.completeness === "partial") return "Lowest partial estimate";
  return qualifying ? "Best qualifying landed" : "Cheapest landed";
}

function formatMarketplaceName(source: string) {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
