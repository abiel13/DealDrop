import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, sourcingListImportRoute, sourcingListRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import type { ApiSourcingListProduct } from "@/services/api";

import {
  duplicateSourcingList,
  getSourcingList,
  getSourcingListErrorMessage,
  updateSourcingList,
} from "../services/sourcing-list.service";
import { shareCsvFile } from "../services/csv-file.service";
import { createSourcingListCsv } from "../services/sourcing-list-csv";
import { calculateSourcingEconomics } from "../services/sourcing-economics";
import type { SourcingListStatus } from "../types/sourcing-list.types";

const statuses: SourcingListStatus[] = ["active", "paused", "completed"];

export function SourcingListDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const params = useLocalSearchParams<{ id?: string }>();
  const sourcingListId = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["sourcing-list", workspaceId, sourcingListId],
    queryFn: () => getSourcingList(workspaceId ?? "", sourcingListId),
    enabled: Boolean(user && workspaceId && sourcingListId),
  });
  const updateMutation = useMutation({
    mutationFn: (status: SourcingListStatus) =>
      updateSourcingList(workspaceId ?? "", sourcingListId, { status }),
    onSuccess: (list) => {
      queryClient.setQueryData(["sourcing-list", workspaceId, sourcingListId], list);
      void queryClient.invalidateQueries({ queryKey: ["sourcing-lists", workspaceId] });
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateSourcingList(workspaceId ?? "", sourcingListId),
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ["sourcing-lists", workspaceId] });
      router.replace(sourcingListRoute(list.id));
    },
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (query.isLoading) return <Loading />;

  if (query.isError || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Sourcing list" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't load this list"
            description="The list may have been removed or is not available in this workspace."
          />
          <Button variant="outline" onPress={() => void query.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const list = query.data;

  async function exportList() {
    setExporting(true);
    setExportError(null);
    try {
      await shareCsvFile(`${safeFilename(list.name)}.csv`, createSourcingListCsv(list));
    } catch {
      setExportError("We couldn't export this sourcing list. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title={list.name}
          subtitle={`${list.status} sourcing list`}
          onBack={() => router.back()}
          action={
            <Button
              size="sm"
              variant="outline"
              loading={duplicateMutation.isPending}
              onPress={() => duplicateMutation.mutate()}
            >
              Duplicate
            </Button>
          }
        />

        <Card padding="md" className="gap-4 bg-primary-soft">
          <View className="flex-row items-end justify-between">
            <View className="gap-1">
              <AppText variant="caption">Sourcing progress</AppText>
              <AppText variant="heading">{list.progress.percentComplete}%</AppText>
            </View>
            <AppText variant="bodySmall">
              {list.progress.sourcedQuantity} / {list.progress.targetQuantity} units
            </AppText>
          </View>
          <View className="h-3 overflow-hidden rounded-full bg-surface">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${list.progress.percentComplete}%` }}
            />
          </View>
          <AppText variant="bodySmall">
            {list.progress.completedProducts} of {list.progress.totalProducts} products complete
          </AppText>
        </Card>

        <Card padding="md" className="gap-3">
          <AppText variant="label">Spreadsheet tools</AppText>
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 px-2"
              onPress={() => router.push(sourcingListImportRoute(list.id))}
            >
              Import CSV
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 px-2"
              loading={exporting}
              onPress={() => void exportList()}
            >
              Export CSV
            </Button>
          </View>
          {exportError && <AppText variant="error">{exportError}</AppText>}
        </Card>

        <Card padding="md" className="gap-3">
          <AppText variant="label">List status</AppText>
          <View className="flex-row gap-2">
            {statuses.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={list.status === status ? "primary" : "outline"}
                loading={updateMutation.isPending && updateMutation.variables === status}
                disabled={updateMutation.isPending}
                onPress={() => updateMutation.mutate(status)}
                className="flex-1 px-2"
              >
                {status}
              </Button>
            ))}
          </View>
          {(updateMutation.isError || duplicateMutation.isError) && (
            <AppText variant="error">
              {getSourcingListErrorMessage(updateMutation.error ?? duplicateMutation.error)}
            </AppText>
          )}
        </Card>

        {list.products.map((product) => (
          <Card key={product.id} padding="md" className="gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <AppText variant="title">{product.productName}</AppText>
                <AppText variant="caption">{product.category}</AppText>
              </View>
              <AppText className="font-semibold text-primary">
                {product.sourcedQuantity}/{product.targetQuantity}
              </AppText>
            </View>

            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              {product.sku && <AppText variant="bodySmall">SKU: {product.sku}</AppText>}
              {product.upc && <AppText variant="bodySmall">UPC: {product.upc}</AppText>}
              {product.gtin && <AppText variant="bodySmall">GTIN: {product.gtin}</AppText>}
              {product.mpn && <AppText variant="bodySmall">MPN: {product.mpn}</AppText>}
            </View>

            <AppText variant="bodySmall">
              Sources: {product.marketplaceIds.map(formatMarketplaceName).join(", ")}
            </AppText>
            <SourcingEconomicsCard product={product} />
            {product.maxUnitCost !== null && (
              <AppText variant="bodySmall">
                Max marketplace unit cost: {product.maxUnitCostCurrency ?? ""} {product.maxUnitCost}
              </AppText>
            )}
            {product.preferredCondition && (
              <AppText variant="bodySmall">Condition: {product.preferredCondition}</AppText>
            )}
            {product.requiredBy && (
              <AppText variant="bodySmall">Required by: {product.requiredBy}</AppText>
            )}
            {product.keywords.length > 0 && (
              <AppText variant="bodySmall">Keywords: {product.keywords.join(", ")}</AppText>
            )}
            {product.notes && <AppText variant="bodySmall">{product.notes}</AppText>}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SourcingEconomicsCard({ product }: { product: ApiSourcingListProduct }) {
  const hasEconomics = [
    product.targetUnitCost,
    product.estimatedShippingCost,
    product.estimatedDutiesTaxes,
    product.otherSourcingCost,
    product.desiredRetailPrice,
    product.minimumDesiredMarginPercent,
    product.maxLandedUnitCost,
  ].some((value) => value !== null);
  if (!hasEconomics) return null;

  const economics = calculateSourcingEconomics({
    quantity: product.targetQuantity,
    marketplacePrice: product.targetUnitCost,
    marketplaceCurrency: product.targetUnitCostCurrency,
    estimatedShippingCost: product.estimatedShippingCost,
    estimatedShippingCurrency: product.estimatedShippingCurrency,
    estimatedDutiesTaxes: product.estimatedDutiesTaxes,
    estimatedDutiesTaxesCurrency: product.estimatedDutiesTaxesCurrency,
    otherSourcingCost: product.otherSourcingCost,
    otherSourcingCostCurrency: product.otherSourcingCostCurrency,
    desiredRetailPrice: product.desiredRetailPrice,
    desiredRetailPriceCurrency: product.desiredRetailPriceCurrency,
    minimumDesiredMarginPercent: product.minimumDesiredMarginPercent,
    maxLandedUnitCost: product.maxLandedUnitCost,
    maxLandedUnitCostCurrency: product.maxLandedUnitCostCurrency,
  });
  const costCurrency = economics.currency ?? product.targetUnitCostCurrency;

  return (
    <Card padding="sm" className="gap-2 bg-surface-muted">
      <View className="flex-row items-center justify-between gap-2">
        <AppText variant="label">Unit economics estimate</AppText>
        <AppText variant="caption">Manual inputs</AppText>
      </View>
      <AppText variant="bodySmall">
        Marketplace price: {formatCost(product.targetUnitCost, product.targetUnitCostCurrency)} /
        unit
      </AppText>
      <AppText variant="bodySmall">
        Shipping: {formatCost(product.estimatedShippingCost, product.estimatedShippingCurrency)}{" "}
        total
      </AppText>
      <AppText variant="bodySmall">
        Duties/taxes:{" "}
        {formatCost(product.estimatedDutiesTaxes, product.estimatedDutiesTaxesCurrency)} total
      </AppText>
      <AppText variant="bodySmall">
        Other sourcing cost:{" "}
        {formatCost(product.otherSourcingCost, product.otherSourcingCostCurrency)} total
      </AppText>
      {economics.costCurrencyMismatch ? (
        <AppText variant="error">
          Landed-cost calculations unavailable because cost components use different currencies. No
          conversion is applied.
        </AppText>
      ) : economics.estimatedLandedUnitCost === null ? (
        <AppText variant="bodySmall">
          Landed cost unavailable: {economics.unknownComponents.join(", ").toLowerCase()} unknown.
        </AppText>
      ) : (
        <>
          <AppText variant="bodySmall">
            Landed unit cost: {formatCost(economics.estimatedLandedUnitCost, costCurrency)}{" "}
            (estimate)
          </AppText>
          <AppText variant="bodySmall">
            Total acquisition: {formatCost(economics.estimatedTotalAcquisitionCost, costCurrency)}{" "}
            for {product.targetQuantity} units
          </AppText>
        </>
      )}
      {economics.currencyMismatch && !economics.costCurrencyMismatch && (
        <AppText variant="error">
          Retail or alert thresholds use a different currency, so those comparisons are unavailable.
          No conversion is applied.
        </AppText>
      )}
      {product.desiredRetailPrice !== null && (
        <AppText variant="bodySmall">
          Gross margin:{" "}
          {economics.estimatedGrossMarginPercent === null
            ? "Unavailable — check price and currency"
            : `${formatCost(economics.estimatedGrossMarginPerUnit, costCurrency)} / unit (${economics.estimatedGrossMarginPercent.toFixed(2)}%)`}
        </AppText>
      )}
      {product.minimumDesiredMarginPercent !== null && economics.minimumMarginMet !== null && (
        <AppText variant="bodySmall">
          Minimum margin: {economics.minimumMarginMet ? "met" : "not met"} (
          {product.minimumDesiredMarginPercent}%)
        </AppText>
      )}
      <AppText variant="bodySmall">
        Alert basis:{" "}
        {product.alertCostBasis === "landed_unit_cost" ? "landed cost" : "marketplace price"}
        {product.alertCostBasis === "landed_unit_cost" && product.maxLandedUnitCost !== null
          ? ` · max ${formatCost(product.maxLandedUnitCost, product.maxLandedUnitCostCurrency)}`
          : ""}
      </AppText>
      {product.alertCostBasis === "landed_unit_cost" && (
        <AppText variant="bodySmall">
          Landed-cost threshold:{" "}
          {economics.maxLandedCostMet === null
            ? "comparison unavailable"
            : economics.maxLandedCostMet
              ? "met"
              : "not met"}
        </AppText>
      )}
    </Card>
  );
}

function formatCost(amount: number | null, currency: string | null) {
  if (amount === null) return "Unknown";
  return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

function formatMarketplaceName(source: string) {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "sourcing-list"
  );
}
