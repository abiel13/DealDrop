import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import {
  authRoutes,
  sourcingListImportRoute,
  sourcingListProductComparisonRoute,
  sourcingListProductHistoryRoute,
  sourcingListRoute,
} from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import {
  getWorkspace,
  getWorkspaceMembers,
} from "@/features/workspaces/services/workspace.service";
import type {
  ApiSourcingActivity,
  ApiSourcingListProduct,
  ApiSourcingList,
  ApiSourcingListProductInput,
  ApiSourcingWorkflowStatus,
  ApiWorkspaceMember,
} from "@/services/api";

import {
  duplicateSourcingList,
  createSourcingNote,
  getSourcingActivity,
  getSourcingNotes,
  getSourcingList,
  getSourcingListErrorMessage,
  updateSourcingListProduct,
  updateSourcingList,
} from "../services/sourcing-list.service";
import { shareCsvFile } from "../services/csv-file.service";
import { createSourcingListCsv } from "../services/sourcing-list-csv";
import { calculateSourcingEconomics } from "../services/sourcing-economics";
import type { SourcingListStatus } from "../types/sourcing-list.types";

const statuses: SourcingListStatus[] = ["active", "paused", "completed"];
const workflowStatuses: ApiSourcingWorkflowStatus[] = [
  "searching",
  "shortlisted",
  "ready_to_buy",
  "ordered",
  "skipped",
  "completed",
];

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
  const workspaceQuery = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWorkspace(workspaceId ?? ""),
    enabled: Boolean(user && workspaceId),
  });
  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId ?? ""),
    enabled: Boolean(user && workspaceId),
  });
  const activityQuery = useQuery({
    queryKey: ["sourcing-activity", workspaceId, sourcingListId],
    queryFn: () => getSourcingActivity(workspaceId ?? "", sourcingListId),
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
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        keyboardShouldPersistTaps="handled"
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
            <ProductWorkflowCard
              workspaceId={workspaceId}
              sourcingListId={list.id}
              product={product}
              members={membersQuery.data ?? []}
              canEdit={
                workspaceQuery.data?.role === "owner" || workspaceQuery.data?.role === "buyer"
              }
              onUpdated={(updatedList) =>
                queryClient.setQueryData(
                  ["sourcing-list", workspaceId, sourcingListId],
                  updatedList,
                )
              }
            />
            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 px-2"
                onPress={() => router.push(sourcingListProductHistoryRoute(list.id, product.id))}
              >
                Price history
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 px-2"
                onPress={() => router.push(sourcingListProductComparisonRoute(list.id, product.id))}
              >
                Compare sources
              </Button>
            </View>
          </Card>
        ))}
        {activityQuery.data && activityQuery.data.length > 0 && (
          <Card padding="md" className="gap-3">
            <AppText variant="label">Recent sourcing activity</AppText>
            {activityQuery.data.slice(0, 12).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </Card>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function ProductWorkflowCard({
  workspaceId,
  sourcingListId,
  product,
  members,
  canEdit,
  onUpdated,
}: {
  workspaceId: string;
  sourcingListId: string;
  product: ApiSourcingListProduct;
  members: ApiWorkspaceMember[];
  canEdit: boolean;
  onUpdated: (list: ApiSourcingList) => void;
}) {
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const notesQuery = useQuery({
    queryKey: ["sourcing-notes", workspaceId, sourcingListId, product.id],
    queryFn: () => getSourcingNotes(workspaceId, sourcingListId, product.id),
  });
  const updateMutation = useMutation({
    mutationFn: (input: Partial<ApiSourcingListProductInput>) =>
      updateSourcingListProduct(workspaceId, sourcingListId, product.id, input),
    onSuccess: (list) => {
      onUpdated(list);
      void queryClient.invalidateQueries({
        queryKey: ["sourcing-activity", workspaceId, sourcingListId],
      });
    },
  });
  const noteMutation = useMutation({
    mutationFn: () => createSourcingNote(workspaceId, sourcingListId, product.id, note.trim()),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({
        queryKey: ["sourcing-notes", workspaceId, sourcingListId, product.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sourcing-activity", workspaceId, sourcingListId],
      });
    },
  });

  return (
    <Card padding="sm" className="gap-3 bg-surface-muted">
      <AppText variant="label">Team workflow</AppText>
      <View className="flex-row flex-wrap gap-2">
        {workflowStatuses.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={product.workflowStatus === status ? "primary" : "outline"}
            disabled={!canEdit || updateMutation.isPending}
            loading={
              updateMutation.isPending && updateMutation.variables?.workflowStatus === status
            }
            onPress={() => updateMutation.mutate({ workflowStatus: status })}
            className="px-2"
          >
            {formatWorkflowStatus(status)}
          </Button>
        ))}
      </View>
      <AppText variant="bodySmall">
        Assigned to:{" "}
        {members.find((member) => member.userId === product.assignedTo)?.fullName ??
          members.find((member) => member.userId === product.assignedTo)?.email ??
          "Unassigned"}
      </AppText>
      {canEdit && (
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant={product.assignedTo === null ? "secondary" : "outline"}
            onPress={() => updateMutation.mutate({ assignedTo: null })}
          >
            Unassigned
          </Button>
          {members
            .filter((member) => member.role !== "viewer")
            .map((member) => (
              <Button
                key={member.userId}
                size="sm"
                variant={product.assignedTo === member.userId ? "secondary" : "outline"}
                onPress={() => updateMutation.mutate({ assignedTo: member.userId })}
              >
                {member.fullName ?? member.email ?? "Member"}
              </Button>
            ))}
        </View>
      )}
      {notesQuery.data?.map((item) => (
        <View key={item.id} className="gap-1 border-t border-border pt-2">
          <AppText variant="caption">{item.authorName ?? "Team member"}</AppText>
          <AppText variant="bodySmall">{item.body}</AppText>
        </View>
      ))}
      {canEdit && (
        <View className="gap-2">
          <Input
            label="Internal note"
            placeholder="Add context for the team"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!note.trim()}
            loading={noteMutation.isPending}
            onPress={() => noteMutation.mutate()}
          >
            Add note
          </Button>
        </View>
      )}
    </Card>
  );
}

function ActivityRow({ activity }: { activity: ApiSourcingActivity }) {
  return (
    <View className="flex-row items-start gap-2 border-t border-border pt-2">
      <View className="flex-1 gap-1">
        <AppText variant="bodySmall">
          {activity.actorName ?? "Team member"} · {formatActivityType(activity.eventType)}
        </AppText>
        <AppText variant="caption">{formatActivityMetadata(activity.metadata)}</AppText>
      </View>
      <AppText variant="caption">{formatActivityDate(activity.createdAt)}</AppText>
    </View>
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

function formatWorkflowStatus(status: ApiSourcingWorkflowStatus) {
  return status.replaceAll("_", " ");
}

function formatActivityType(eventType: ApiSourcingActivity["eventType"]) {
  return eventType.replaceAll("_", " ");
}

function formatActivityMetadata(metadata: Record<string, unknown>) {
  const values = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key.replaceAll(/([A-Z])/g, " $1").toLowerCase()}: ${String(value)}`);
  return values.join(" · ") || "Sourcing activity recorded";
}

function formatActivityDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "sourcing-list"
  );
}
