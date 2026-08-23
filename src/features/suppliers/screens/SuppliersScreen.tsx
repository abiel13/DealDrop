import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Pressable, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { SafeAreaView } from "react-native-safe-area-context";

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
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import type {
  ApiSupplier,
  ApiSupplierInput,
  ApiSupplierStatus,
  MarketplaceSource,
} from "@/services/api";

import {
  createSupplier,
  getSuppliers,
  removeSupplier,
  updateSupplier,
} from "../services/supplier.service";

const SOURCES: MarketplaceSource[] = ["amazon_business", "ebay", "etsy", "rakuten"];
const STATUSES: (ApiSupplierStatus | "all")[] = ["all", "preferred", "avoid", "unreviewed"];

const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a supplier or seller name."),
  marketplaceSellerId: z.string().trim().max(300).optional(),
  supplierUrl: z.string().trim().url("Enter a valid URL.").or(z.literal("")),
  tags: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  internalContactInfo: z.string().trim().max(1000).optional(),
  typicalLeadTimeDays: z.string().trim().optional(),
  minimumOrderQuantity: z.string().trim().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export function SuppliersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApiSupplierStatus | "all">("all");
  const [isCreating, setIsCreating] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<ApiSupplier | null>(null);
  const queryKey = ["workspace-suppliers", workspaceId, search, status] as const;
  const suppliersQuery = useQuery({
    queryKey,
    queryFn: () =>
      getSuppliers(workspaceId ?? "", {
        query: search.trim() || undefined,
        status: status === "all" ? undefined : status,
      }),
    enabled: Boolean(user && workspaceId),
  });
  const statusMutation = useMutation({
    mutationFn: ({ supplier, next }: { supplier: ApiSupplier; next: ApiSupplierStatus }) =>
      updateSupplier(workspaceId ?? "", supplier.id, { status: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-suppliers", workspaceId] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (supplierId: string) => removeSupplier(workspaceId ?? "", supplierId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-suppliers", workspaceId] });
    },
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (suppliersQuery.isLoading) return <Loading />;

  function startCreate() {
    setEditingSupplier(null);
    setIsCreating(true);
  }

  function startEdit(supplier: ApiSupplier) {
    setEditingSupplier(supplier);
    setIsCreating(true);
  }

  function confirmDelete(supplier: ApiSupplier) {
    Alert.alert(
      "Remove saved supplier?",
      "This removes the saved supplier context. Existing shortlisted history remains in the workspace.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteMutation.mutate(supplier.id),
        },
      ],
    );
  }

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
          title="Suppliers"
          subtitle="Remember sellers and sourcing context inside this Pro workspace."
          onBack={() => router.back()}
          action={
            <Button size="sm" onPress={startCreate}>
              Add supplier
            </Button>
          }
        />

        {isCreating && (
          <SupplierEditor
            supplier={editingSupplier}
            workspaceId={workspaceId}
            onCancel={() => setIsCreating(false)}
            onSaved={() => {
              setIsCreating(false);
              void queryClient.invalidateQueries({
                queryKey: ["workspace-suppliers", workspaceId],
              });
            }}
          />
        )}

        <Input
          label="Search saved suppliers"
          placeholder="Search by seller or supplier name"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />

        <View className="flex-row flex-wrap gap-2">
          {STATUSES.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: status === option }}
              className={`rounded-full px-3 py-2 ${status === option ? "bg-primary" : "bg-surface-muted"}`}
              onPress={() => setStatus(option)}
            >
              <AppText className={status === option ? "text-white" : "text-text-secondary"}>
                {capitalize(option)}
              </AppText>
            </Pressable>
          ))}
        </View>

        {suppliersQuery.isError ? (
          <>
            <ErrorState
              title="Couldn't load suppliers"
              description="Please check your connection and try again."
            />
            <Button variant="outline" onPress={() => void suppliersQuery.refetch()}>
              Try again
            </Button>
          </>
        ) : (suppliersQuery.data ?? []).length === 0 ? (
          <Card padding="lg" className="items-center gap-3 bg-primary-soft">
            <AppText variant="title" className="text-center">
              No saved suppliers yet
            </AppText>
            <AppText variant="bodySmall" className="text-center">
              Save a seller from a comparison or add one manually so future sourcing results carry
              useful context.
            </AppText>
            <Button onPress={startCreate}>Add supplier</Button>
          </Card>
        ) : (
          (suppliersQuery.data ?? []).map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              statusPending={
                statusMutation.isPending && statusMutation.variables?.supplier.id === supplier.id
              }
              onEdit={() => startEdit(supplier)}
              onDelete={() => confirmDelete(supplier)}
              onStatusChange={(next) => statusMutation.mutate({ supplier, next })}
            />
          ))
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function SupplierEditor({
  supplier,
  workspaceId,
  onCancel,
  onSaved,
}: {
  supplier: ApiSupplier | null;
  workspaceId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [marketplace, setMarketplace] = useState<MarketplaceSource>(
    supplier?.marketplace ?? "ebay",
  );
  const queryClient = useQueryClient();
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      marketplaceSellerId: supplier?.marketplaceSellerId ?? "",
      supplierUrl: supplier?.supplierUrl ?? "",
      tags: supplier?.tags.join(", ") ?? "",
      notes: supplier?.notes ?? "",
      internalContactInfo: supplier?.internalContactInfo ?? "",
      typicalLeadTimeDays: supplier?.typicalLeadTimeDays?.toString() ?? "",
      minimumOrderQuantity: supplier?.minimumOrderQuantity?.toString() ?? "",
    },
    mode: "onBlur",
  });
  const saveMutation = useMutation({
    mutationFn: (input: ApiSupplierInput) =>
      supplier
        ? updateSupplier(workspaceId, supplier.id, input)
        : createSupplier(workspaceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-suppliers", workspaceId] });
      onSaved();
    },
  });

  function submit(values: SupplierFormValues) {
    const leadTime = parseOptionalInteger(values.typicalLeadTimeDays, "lead time");
    const minimumOrderQuantity = parseOptionalInteger(values.minimumOrderQuantity, "MOQ");
    if (leadTime.error || minimumOrderQuantity.error) {
      form.setError("typicalLeadTimeDays", {
        message: leadTime.error || minimumOrderQuantity.error || "Enter a valid whole number.",
      });
      return;
    }
    saveMutation.mutate({
      name: values.name.trim(),
      marketplace,
      marketplaceSellerId: values.marketplaceSellerId?.trim() || null,
      supplierUrl: values.supplierUrl?.trim() || null,
      tags: values.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: values.notes?.trim() || null,
      internalContactInfo: values.internalContactInfo?.trim() || null,
      typicalLeadTimeDays: leadTime.value,
      minimumOrderQuantity: minimumOrderQuantity.value,
    });
  }

  return (
    <Card padding="md" className="gap-4 bg-primary-soft">
      <View className="gap-1">
        <AppText variant="title">{supplier ? "Edit supplier" : "Add supplier"}</AppText>
        <AppText variant="bodySmall">
          Save only marketplace details you know or information you enter yourself.
        </AppText>
      </View>

      <Controller
        control={form.control}
        name="name"
        render={({ field: { onBlur, onChange, value } }) => (
          <Input
            label="Supplier or seller name"
            placeholder="e.g. Acme Wholesale"
            autoCapitalize="words"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={form.formState.errors.name?.message}
          />
        )}
      />

      <View className="gap-2">
        <AppText variant="label">Marketplace/source</AppText>
        <View className="flex-row flex-wrap gap-2">
          {SOURCES.map((source) => (
            <Pressable
              key={source}
              className={`rounded-full px-3 py-2 ${marketplace === source ? "bg-primary" : "bg-surface-muted"}`}
              onPress={() => setMarketplace(source)}
            >
              <AppText className={marketplace === source ? "text-white" : "text-text-secondary"}>
                {formatMarketplaceName(source)}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>

      <FormInput
        form={form}
        name="marketplaceSellerId"
        label="Marketplace seller ID (optional)"
        placeholder="Seller or merchant ID"
      />
      <FormInput
        form={form}
        name="supplierUrl"
        label="Supplier URL (optional)"
        placeholder="https://example.com/seller"
        keyboardType="url"
        autoCapitalize="none"
      />
      <FormInput
        form={form}
        name="tags"
        label="Tags (optional)"
        placeholder="phones, wholesale, local"
      />
      <View className="flex-row gap-3">
        <FormInput
          form={form}
          name="typicalLeadTimeDays"
          label="Lead time (days)"
          placeholder="Unknown"
          keyboardType="number-pad"
          className="flex-1"
        />
        <FormInput
          form={form}
          name="minimumOrderQuantity"
          label="MOQ"
          placeholder="Unknown"
          keyboardType="number-pad"
          className="flex-1"
        />
      </View>
      <FormInput
        form={form}
        name="internalContactInfo"
        label="Internal contact (optional)"
        placeholder="Your private contact note"
        multiline
      />
      <FormInput
        form={form}
        name="notes"
        label="Notes (optional)"
        placeholder="Sourcing notes"
        multiline
      />

      {saveMutation.isError && (
        <AppText variant="error">We couldn&apos;t save this supplier. Please try again.</AppText>
      )}
      <View className="flex-row gap-3">
        <Button variant="outline" className="flex-1" onPress={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          loading={saveMutation.isPending}
          onPress={form.handleSubmit(submit)}
        >
          Save supplier
        </Button>
      </View>
    </Card>
  );
}

function FormInput({
  form,
  name,
  ...props
}: {
  form: ReturnType<typeof useForm<SupplierFormValues>>;
  name: keyof SupplierFormValues;
  label: string;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "url";
  autoCapitalize?: "none" | "words";
  multiline?: boolean;
  className?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field: { onBlur, onChange, value } }) => (
        <Input
          {...props}
          onBlur={onBlur}
          onChangeText={onChange}
          value={value}
          error={form.formState.errors[name]?.message}
        />
      )}
    />
  );
}

function SupplierCard({
  supplier,
  statusPending,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  supplier: ApiSupplier;
  statusPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: ApiSupplierStatus) => void;
}) {
  const nextStatus: ApiSupplierStatus =
    supplier.status === "preferred" ? "unreviewed" : "preferred";
  return (
    <Card padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <AppText variant="title">{supplier.name}</AppText>
          <AppText variant="caption">
            {formatMarketplaceName(supplier.marketplace)} · {capitalize(supplier.status)}
          </AppText>
        </View>
        {supplier.status === "preferred" && <Badge label="Preferred" />}
        {supplier.status === "avoid" && <Badge label="Avoid" muted />}
      </View>

      {supplier.tags.length > 0 && (
        <AppText variant="bodySmall">Tags: {supplier.tags.join(", ")}</AppText>
      )}
      {supplier.marketplaceSellerId && (
        <AppText variant="bodySmall">Seller ID: {supplier.marketplaceSellerId}</AppText>
      )}
      {(supplier.typicalLeadTimeDays !== null || supplier.minimumOrderQuantity !== null) && (
        <AppText variant="bodySmall">
          {supplier.typicalLeadTimeDays === null
            ? "Lead time unknown"
            : `${supplier.typicalLeadTimeDays} day lead time`}
          {supplier.minimumOrderQuantity === null ? "" : ` · MOQ ${supplier.minimumOrderQuantity}`}
        </AppText>
      )}
      <AppText variant="caption">
        {supplier.shortlistedCount} shortlisted result{supplier.shortlistedCount === 1 ? "" : "s"}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          loading={statusPending}
          onPress={() => onStatusChange(nextStatus)}
        >
          {supplier.status === "preferred" ? "Unmark preferred" : "Mark preferred"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onPress={() => onStatusChange(supplier.status === "avoid" ? "unreviewed" : "avoid")}
        >
          {supplier.status === "avoid" ? "Clear avoid" : "Mark avoid"}
        </Button>
        <Button size="sm" variant="ghost" onPress={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onPress={onDelete}>
          Remove
        </Button>
      </View>
    </Card>
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

function parseOptionalInteger(value: string | undefined, label: string) {
  if (!value?.trim()) return { value: null as number | null, error: null as string | null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: null, error: `${capitalize(label)} must be a whole number of 0 or more.` };
  }
  return { value: parsed, error: null };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMarketplaceName(source: string) {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
