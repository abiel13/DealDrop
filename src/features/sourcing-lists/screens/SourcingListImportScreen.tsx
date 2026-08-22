import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, sourcingListRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { getSupportedMarketplaces } from "@/features/watchlists/services/watchlist.service";
import { getWorkspace } from "@/features/workspaces/services/workspace.service";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";

import { shareCsvFile } from "../services/csv-file.service";
import {
  buildSourcingCsvReport,
  createSourcingListCsvTemplate,
  parseSourcingListCsv,
  type SourcingCsvDraft,
  type SourcingCsvReport,
  type SourcingCsvRow,
} from "../services/sourcing-list-csv";
import {
  getSourcingList,
  getSourcingListErrorMessage,
  importSourcingListProducts,
} from "../services/sourcing-list.service";
import type { SourcingListImportInput } from "../types/sourcing-list.types";

export function SourcingListImportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const params = useLocalSearchParams<{ id?: string }>();
  const sourcingListId = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();
  const [report, setReport] = useState<SourcingCsvReport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSharingTemplate, setIsSharingTemplate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ["sourcing-list", workspaceId, sourcingListId],
    queryFn: () => getSourcingList(workspaceId ?? "", sourcingListId),
    enabled: Boolean(user && workspaceId && sourcingListId),
  });
  const workspaceQuery = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWorkspace(workspaceId ?? ""),
    enabled: Boolean(user && workspaceId),
  });
  const marketplacesQuery = useQuery({
    queryKey: ["supported-marketplaces"],
    queryFn: getSupportedMarketplaces,
    enabled: Boolean(user && workspaceId),
  });
  const importMutation = useMutation({
    mutationFn: (input: SourcingListImportInput) =>
      importSourcingListProducts(workspaceId ?? "", sourcingListId, input),
    onSuccess: (result) => {
      queryClient.setQueryData(["sourcing-list", workspaceId, sourcingListId], result.list);
      void queryClient.invalidateQueries({ queryKey: ["sourcing-lists", workspaceId] });
      if (result.duplicateImport) {
        setMessage("This file has already been imported into this sourcing list.");
        return;
      }
      router.replace(sourcingListRoute(result.list.id));
    },
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (listQuery.isLoading || workspaceQuery.isLoading || marketplacesQuery.isLoading) {
    return <Loading />;
  }

  if (listQuery.isError || workspaceQuery.isError || marketplacesQuery.isError || !listQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Import products" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't prepare the import"
            description="The sourcing list or marketplace sources could not be loaded."
          />
        </View>
      </SafeAreaView>
    );
  }

  const list = listQuery.data;
  const marketplaces = marketplacesQuery.data ?? [];
  const validationOptions = {
    marketplaces,
    existingProducts: list.products,
    defaultCurrency: workspaceQuery.data?.defaultCurrency ?? "USD",
  };
  const selectedCount = report?.rows.filter((row) => row.included && row.input).length ?? 0;
  const validCount = report?.rows.filter((row) => row.status === "valid").length ?? 0;
  const invalidCount = report?.rows.filter((row) => row.status === "invalid").length ?? 0;
  const duplicateCount = report?.rows.filter((row) => row.status === "duplicate").length ?? 0;

  async function selectCsv() {
    setIsParsing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const csv = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const nextReport = await parseSourcingListCsv(csv, validationOptions);
      setFileName(asset.name);
      setReport(nextReport);
    } catch {
      setError("We couldn't read that CSV file. Check that it is a valid UTF-8 CSV and try again.");
    } finally {
      setIsParsing(false);
    }
  }

  async function shareTemplate() {
    setIsSharingTemplate(true);
    setError(null);
    try {
      await shareCsvFile(
        "dealdrop-sourcing-list-template.csv",
        createSourcingListCsvTemplate(marketplaces),
      );
    } catch {
      setError("We couldn't share the CSV template. Please try again.");
    } finally {
      setIsSharingTemplate(false);
    }
  }

  function updateRow(rowNumber: number, draft: SourcingCsvDraft) {
    if (!report) return;
    const includedByRow = new Map(report.rows.map((row) => [row.rowNumber, row.included]));
    const drafts = report.rows.map((row) => (row.rowNumber === rowNumber ? draft : row.draft));
    setReport(
      buildSourcingCsvReport(drafts, validationOptions, report.fileFingerprint, includedByRow),
    );
    setMessage(null);
  }

  function toggleRow(rowNumber: number) {
    if (!report) return;
    const includedByRow = new Map(report.rows.map((row) => [row.rowNumber, row.included]));
    const row = report.rows.find((item) => item.rowNumber === rowNumber);
    if (!row?.input) return;
    includedByRow.set(rowNumber, !row.included);
    setReport(
      buildSourcingCsvReport(
        report.rows.map((item) => item.draft),
        validationOptions,
        report.fileFingerprint,
        includedByRow,
      ),
    );
  }

  function importSelectedRows() {
    if (!report) return;
    const products = report.rows.flatMap((row) => (row.included && row.input ? [row.input] : []));
    if (products.length === 0) return;
    setError(null);
    setMessage(null);
    importMutation.mutate({ fileFingerprint: report.fileFingerprint, products });
  }

  if (!report) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 gap-5 px-5 pb-8 pt-6">
          <AppHeader
            title="Import products"
            subtitle="Review a CSV before adding products to this sourcing list."
            onBack={() => router.back()}
          />
          <Card padding="md" className="gap-3 bg-primary-soft">
            <AppText variant="title">Use your existing spreadsheet</AppText>
            <AppText variant="bodySmall">
              We support product name, SKU, UPC/GTIN/MPN, quantity, target price, keywords,
              category, notes, sources, condition, and required-by date.
            </AppText>
            <AppText variant="caption">
              CSV files are reviewed on-device first. Invalid and duplicate rows are excluded until
              you choose to correct or include them.
            </AppText>
          </Card>
          <Button loading={isParsing} onPress={() => void selectCsv()}>
            Select CSV file
          </Button>
          <Button
            variant="outline"
            loading={isSharingTemplate}
            onPress={() => void shareTemplate()}
          >
            Download CSV template
          </Button>
          {error && <AppText variant="error">{error}</AppText>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 gap-4 pt-6">
        <View className="px-5">
          <AppHeader
            title="Review CSV import"
            subtitle={fileName ?? "Selected CSV file"}
            onBack={() => router.back()}
          />
        </View>
        <Card padding="md" className="mx-5 gap-3">
          <View className="flex-row justify-between gap-2">
            <AppText variant="bodySmall">Valid: {validCount}</AppText>
            <AppText variant="bodySmall">Invalid: {invalidCount}</AppText>
            <AppText variant="bodySmall">Duplicates: {duplicateCount}</AppText>
          </View>
          <AppText variant="caption">
            {selectedCount} row{selectedCount === 1 ? "" : "s"} selected for import. Edit a row and
            leave the field to revalidate it, or exclude it from this import.
          </AppText>
          {report.headerErrors.map((headerError) => (
            <AppText key={headerError} variant="error">
              {headerError}
            </AppText>
          ))}
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 px-2"
              onPress={() => void selectCsv()}
            >
              Choose another
            </Button>
            <Button
              size="sm"
              className="flex-1 px-2"
              loading={importMutation.isPending}
              disabled={selectedCount === 0 || report.headerErrors.length > 0}
              onPress={importSelectedRows}
            >
              Import {selectedCount}
            </Button>
          </View>
          {message && <AppText variant="bodySmall">{message}</AppText>}
          {(error || importMutation.isError) && (
            <AppText variant="error">
              {error ?? getSourcingListErrorMessage(importMutation.error)}
            </AppText>
          )}
        </Card>
        <FlatList
          className="flex-1"
          contentContainerClassName="gap-4 px-5 pb-8"
          data={report.rows}
          extraData={report}
          keyExtractor={(row) => `${report.fileFingerprint}-${row.rowNumber}`}
          renderItem={({ item }) => (
            <ImportRowCard row={item} onChange={updateRow} onToggle={toggleRow} />
          )}
          ListEmptyComponent={
            <Card padding="md">
              <AppText variant="bodySmall">No product rows were found in this CSV.</AppText>
            </Card>
          }
        />
      </View>
    </SafeAreaView>
  );
}

function ImportRowCard({
  row,
  onChange,
  onToggle,
}: {
  row: SourcingCsvRow;
  onChange: (rowNumber: number, draft: SourcingCsvDraft) => void;
  onToggle: (rowNumber: number) => void;
}) {
  const [draft, setDraft] = useState(row.draft);

  function commit() {
    onChange(row.rowNumber, draft);
  }

  return (
    <Card padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <AppText variant="title">Row {row.rowNumber}</AppText>
          <AppText variant="caption">
            {row.status === "valid" ? "Ready to import" : row.status}
          </AppText>
        </View>
        <Button
          size="sm"
          variant={row.included ? "primary" : "outline"}
          disabled={!row.input}
          onPress={() => onToggle(row.rowNumber)}
        >
          {row.included ? "Included" : "Exclude"}
        </Button>
      </View>

      <Input
        label="Product name"
        value={draft.productName}
        onChangeText={(value) => setDraft((current) => ({ ...current, productName: value }))}
        onBlur={commit}
      />
      <View className="flex-row gap-3">
        <Input
          className="flex-1"
          label="Category"
          value={draft.category}
          onChangeText={(value) => setDraft((current) => ({ ...current, category: value }))}
          onBlur={commit}
        />
        <Input
          className="flex-1"
          label="Quantity"
          keyboardType="number-pad"
          value={draft.quantityRequired}
          onChangeText={(value) => setDraft((current) => ({ ...current, quantityRequired: value }))}
          onBlur={commit}
        />
      </View>
      <View className="flex-row gap-3">
        <Input
          className="flex-1"
          label="SKU"
          value={draft.sku}
          onChangeText={(value) => setDraft((current) => ({ ...current, sku: value }))}
          onBlur={commit}
        />
        <Input
          className="flex-1"
          label="Target price"
          keyboardType="decimal-pad"
          value={draft.targetUnitPrice}
          onChangeText={(value) => setDraft((current) => ({ ...current, targetUnitPrice: value }))}
          onBlur={commit}
        />
      </View>
      <View className="flex-row gap-3">
        <Input
          className="flex-1"
          label="UPC"
          value={draft.upc}
          onChangeText={(value) => setDraft((current) => ({ ...current, upc: value }))}
          onBlur={commit}
        />
        <Input
          className="flex-1"
          label="GTIN"
          value={draft.gtin}
          onChangeText={(value) => setDraft((current) => ({ ...current, gtin: value }))}
          onBlur={commit}
        />
      </View>
      <View className="flex-row gap-3">
        <Input
          className="flex-1"
          label="MPN"
          value={draft.mpn}
          onChangeText={(value) => setDraft((current) => ({ ...current, mpn: value }))}
          onBlur={commit}
        />
        <Input
          className="flex-1"
          label="Currency"
          value={draft.maxUnitCostCurrency}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, maxUnitCostCurrency: value }))
          }
          onBlur={commit}
        />
      </View>
      <Input
        label="Keywords"
        placeholder="e.g. camera|tripod"
        value={draft.keywords}
        onChangeText={(value) => setDraft((current) => ({ ...current, keywords: value }))}
        onBlur={commit}
      />
      <Input
        label="Marketplaces / sources"
        placeholder="e.g. ebay|etsy"
        value={draft.marketplaces}
        onChangeText={(value) => setDraft((current) => ({ ...current, marketplaces: value }))}
        onBlur={commit}
      />
      <View className="flex-row gap-3">
        <Input
          className="flex-1"
          label="Condition"
          value={draft.preferredCondition}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, preferredCondition: value }))
          }
          onBlur={commit}
        />
        <Input
          className="flex-1"
          label="Required by"
          placeholder="YYYY-MM-DD"
          value={draft.requiredBy}
          onChangeText={(value) => setDraft((current) => ({ ...current, requiredBy: value }))}
          onBlur={commit}
        />
      </View>
      <Input
        label="Notes"
        value={draft.notes}
        onChangeText={(value) => setDraft((current) => ({ ...current, notes: value }))}
        onBlur={commit}
      />
      {row.reasons.map((reason) => (
        <AppText key={reason} variant={row.status === "duplicate" ? "bodySmall" : "error"}>
          {reason}
        </AppText>
      ))}
    </Card>
  );
}
