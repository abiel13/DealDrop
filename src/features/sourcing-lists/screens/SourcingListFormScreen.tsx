import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, sourcingListRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { getSupportedMarketplaces } from "@/features/watchlists/services/watchlist.service";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import { getWorkspace } from "@/features/workspaces/services/workspace.service";
import type { MarketplaceSource } from "@/services/api";

import { createSourcingList, getSourcingListErrorMessage } from "../services/sourcing-list.service";
import type { SourcingListInput } from "../types/sourcing-list.types";

const optionalDate = z
  .string()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use YYYY-MM-DD or leave this blank.",
  );

const optionalAmount = z
  .string()
  .refine(
    (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
    "Enter a non-negative amount or leave this blank.",
  );

const optionalPercent = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100),
    "Enter a percentage from 0 to 100 or leave this blank.",
  );

const productSchema = z
  .object({
    category: z.string().trim().min(1, "Add a category."),
    productName: z.string().trim().min(1, "Add a product name."),
    sku: z.string(),
    upc: z.string(),
    gtin: z.string(),
    mpn: z.string(),
    keywords: z.string(),
    targetQuantity: z
      .string()
      .regex(/^\d+$/, "Enter a whole number.")
      .refine((value) => Number(value) > 0, "Quantity must be at least 1."),
    economicsCurrency: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^[A-Za-z]{3}$/.test(value),
        "Use a 3-letter currency code.",
      ),
    targetUnitCost: optionalAmount,
    maxUnitCost: optionalAmount,
    estimatedShippingCost: optionalAmount,
    estimatedDutiesTaxes: optionalAmount,
    otherSourcingCost: optionalAmount,
    desiredRetailPrice: optionalAmount,
    minimumDesiredMarginPercent: optionalPercent,
    maxLandedUnitCost: optionalAmount,
    alertCostBasis: z.enum(["marketplace_price", "landed_unit_cost"]),
    preferredCondition: z.string(),
    marketplaceIds: z.array(z.string()).min(1, "Choose at least one marketplace."),
    notes: z.string(),
    requiredBy: optionalDate,
  })
  .superRefine((value, context) => {
    if (value.alertCostBasis === "landed_unit_cost" && value.maxLandedUnitCost === "") {
      context.addIssue({
        code: "custom",
        path: ["maxLandedUnitCost"],
        message: "Add a landed-cost threshold for landed-cost alerts.",
      });
    }
  });

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter a name for this sourcing list."),
  products: z.array(productSchema).min(1, "Add at least one product."),
});

type FormValues = z.infer<typeof formSchema>;

const emptyProduct: FormValues["products"][number] = {
  category: "",
  productName: "",
  sku: "",
  upc: "",
  gtin: "",
  mpn: "",
  keywords: "",
  targetQuantity: "1",
  economicsCurrency: "",
  targetUnitCost: "",
  maxUnitCost: "",
  estimatedShippingCost: "",
  estimatedDutiesTaxes: "",
  otherSourcingCost: "",
  desiredRetailPrice: "",
  minimumDesiredMarginPercent: "",
  maxLandedUnitCost: "",
  alertCostBasis: "marketplace_price",
  preferredCondition: "",
  marketplaceIds: [],
  notes: "",
  requiredBy: "",
};

export function SourcingListFormScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const queryClient = useQueryClient();
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
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", products: [emptyProduct] },
    mode: "onBlur",
  });
  const { fields, append, remove } = useFieldArray({ control, name: "products" });
  const watchedProducts = useWatch({ control, name: "products" });
  const createMutation = useMutation({
    mutationFn: (input: SourcingListInput) => createSourcingList(workspaceId ?? "", input),
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ["sourcing-lists", workspaceId] });
      router.replace(sourcingListRoute(list.id));
    },
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (workspaceQuery.isLoading || marketplacesQuery.isLoading) return <Loading />;

  if (workspaceQuery.isError || marketplacesQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="New sourcing list" onBack={() => router.back()} />
          <ErrorState
            title="Couldn't prepare the form"
            description="Please check your connection and try again."
          />
        </View>
      </SafeAreaView>
    );
  }

  const marketplaces = marketplacesQuery.data ?? [];
  const workspace = workspaceQuery.data;

  function submit(values: FormValues) {
    const input: SourcingListInput = {
      name: values.name.trim(),
      status: "active",
      products: values.products.map((product) => {
        const currency =
          product.economicsCurrency.trim().toUpperCase() || workspace?.defaultCurrency || "USD";
        const amount = (value: string) => (value.trim() ? Number(value) : null);
        const targetUnitCost = amount(product.targetUnitCost);
        const maxUnitCost = amount(product.maxUnitCost);
        const estimatedShippingCost = amount(product.estimatedShippingCost);
        const estimatedDutiesTaxes = amount(product.estimatedDutiesTaxes);
        const otherSourcingCost = amount(product.otherSourcingCost);
        const desiredRetailPrice = amount(product.desiredRetailPrice);
        const maxLandedUnitCost = amount(product.maxLandedUnitCost);

        return {
          category: product.category.trim(),
          productName: product.productName.trim(),
          sku: optionalText(product.sku),
          upc: optionalText(product.upc),
          gtin: optionalText(product.gtin),
          mpn: optionalText(product.mpn),
          keywords: product.keywords
            .split(",")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          targetQuantity: Number(product.targetQuantity),
          targetUnitCost,
          targetUnitCostCurrency: targetUnitCost === null ? null : currency,
          maxUnitCost,
          maxUnitCostCurrency: maxUnitCost === null ? null : currency,
          estimatedShippingCost,
          estimatedShippingCurrency: estimatedShippingCost === null ? null : currency,
          estimatedDutiesTaxes,
          estimatedDutiesTaxesCurrency: estimatedDutiesTaxes === null ? null : currency,
          otherSourcingCost,
          otherSourcingCostCurrency: otherSourcingCost === null ? null : currency,
          desiredRetailPrice,
          desiredRetailPriceCurrency: desiredRetailPrice === null ? null : currency,
          minimumDesiredMarginPercent: amount(product.minimumDesiredMarginPercent),
          maxLandedUnitCost,
          maxLandedUnitCostCurrency: maxLandedUnitCost === null ? null : currency,
          alertCostBasis: product.alertCostBasis,
          preferredCondition: optionalText(product.preferredCondition),
          marketplaceIds: product.marketplaceIds as MarketplaceSource[],
          notes: optionalText(product.notes),
          requiredBy: optionalText(product.requiredBy),
        };
      }),
    };
    createMutation.mutate(input);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="New sourcing list"
          subtitle="Capture one restock or buying job with all its requested products."
          onBack={() => router.back()}
        />

        <Controller
          control={control}
          name="name"
          render={({ field: { onBlur, onChange, value } }) => (
            <Input
              label="List name"
              placeholder="e.g. Q4 Phone Inventory"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.name?.message}
            />
          )}
        />

        {fields.map((field, index) => (
          <Card key={field.id} padding="md" className="gap-4">
            <View className="flex-row items-center justify-between gap-3">
              <AppText variant="title">Product {index + 1}</AppText>
              {fields.length > 1 && (
                <Button size="sm" variant="ghost" onPress={() => remove(index)}>
                  Remove
                </Button>
              )}
            </View>

            <Controller
              control={control}
              name={`products.${index}.productName`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Product name"
                  placeholder="e.g. iPhone 15 128GB"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.products?.[index]?.productName?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`products.${index}.category`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Category"
                  placeholder="e.g. Phones"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.products?.[index]?.category?.message}
                />
              )}
            />
            <View className="flex-row gap-3">
              <Controller
                control={control}
                name={`products.${index}.targetUnitCost`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label={`Target unit cost (${workspace?.defaultCurrency ?? "currency"})`}
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.products?.[index]?.targetUnitCost?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name={`products.${index}.maxUnitCost`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label={`Max unit cost (${workspace?.defaultCurrency ?? "currency"})`}
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.products?.[index]?.maxUnitCost?.message}
                  />
                )}
              />
            </View>
            <Controller
              control={control}
              name={`products.${index}.targetQuantity`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Target quantity"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.products?.[index]?.targetQuantity?.message}
                />
              )}
            />
            <Card padding="sm" className="gap-3 bg-surface-muted">
              <AppText variant="label">Unit economics</AppText>
              <AppText variant="caption">
                Enter manual order-level costs in one currency. Blank costs stay unknown; enter 0
                when a cost is known to be zero.
              </AppText>
              <Controller
                control={control}
                name={`products.${index}.economicsCurrency`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Planning currency"
                    placeholder={workspace?.defaultCurrency ?? "USD"}
                    autoCapitalize="characters"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.products?.[index]?.economicsCurrency?.message}
                  />
                )}
              />
              <View className="flex-row gap-3">
                <Controller
                  control={control}
                  name={`products.${index}.estimatedShippingCost`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Shipping total"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.estimatedShippingCost?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`products.${index}.estimatedDutiesTaxes`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Duties / taxes total"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.estimatedDutiesTaxes?.message}
                    />
                  )}
                />
              </View>
              <View className="flex-row gap-3">
                <Controller
                  control={control}
                  name={`products.${index}.otherSourcingCost`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Other sourcing total"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.otherSourcingCost?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`products.${index}.desiredRetailPrice`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Desired retail / unit"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.desiredRetailPrice?.message}
                    />
                  )}
                />
              </View>
              <View className="flex-row gap-3">
                <Controller
                  control={control}
                  name={`products.${index}.maxLandedUnitCost`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Max landed / unit"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.maxLandedUnitCost?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`products.${index}.minimumDesiredMarginPercent`}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Minimum margin %"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.products?.[index]?.minimumDesiredMarginPercent?.message}
                    />
                  )}
                />
              </View>
              <Controller
                control={control}
                name={`products.${index}.alertCostBasis`}
                render={({ field: { onChange, value } }) => (
                  <View className="gap-2">
                    <AppText variant="label">Alert cost basis</AppText>
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        variant={value === "marketplace_price" ? "primary" : "outline"}
                        className="flex-1 px-2"
                        onPress={() => onChange("marketplace_price")}
                      >
                        Marketplace price
                      </Button>
                      <Button
                        size="sm"
                        variant={value === "landed_unit_cost" ? "primary" : "outline"}
                        className="flex-1 px-2"
                        onPress={() => onChange("landed_unit_cost")}
                      >
                        Landed cost
                      </Button>
                    </View>
                  </View>
                )}
              />
            </Card>
            <View className="flex-row gap-3">
              <Controller
                control={control}
                name={`products.${index}.sku`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label="SKU / internal ref"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <Controller
                control={control}
                name={`products.${index}.mpn`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label="MPN"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            <View className="flex-row gap-3">
              <Controller
                control={control}
                name={`products.${index}.upc`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label="UPC"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <Controller
                control={control}
                name={`products.${index}.gtin`}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    className="flex-1"
                    label="GTIN"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
            </View>
            <Controller
              control={control}
              name={`products.${index}.keywords`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Keywords"
                  placeholder="Separate keywords with commas"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Controller
              control={control}
              name={`products.${index}.preferredCondition`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Preferred condition"
                  placeholder="e.g. New, refurbished"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Controller
              control={control}
              name={`products.${index}.requiredBy`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Required by"
                  placeholder="YYYY-MM-DD"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.products?.[index]?.requiredBy?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`products.${index}.notes`}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Notes"
                  multiline
                  numberOfLines={3}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />

            <View className="gap-2">
              <AppText variant="label">Marketplaces / sources</AppText>
              <View className="flex-row flex-wrap gap-2">
                {marketplaces.map((marketplace) => {
                  const current = watchedProducts[index]?.marketplaceIds ?? [];
                  const selected = current.includes(marketplace.source);
                  return (
                    <Pressable
                      key={marketplace.source}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      className={`rounded-xl px-3 py-2 ${selected ? "bg-primary" : "bg-surface-muted"}`}
                      onPress={() => {
                        setValue(
                          `products.${index}.marketplaceIds`,
                          selected
                            ? current.filter((source) => source !== marketplace.source)
                            : [...current, marketplace.source],
                          { shouldValidate: true },
                        );
                      }}
                    >
                      <AppText className={selected ? "font-semibold text-white" : ""}>
                        {formatMarketplaceName(marketplace.source)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {errors.products?.[index]?.marketplaceIds?.message && (
                <AppText variant="error">{errors.products[index]?.marketplaceIds?.message}</AppText>
              )}
            </View>
          </Card>
        ))}

        <Button
          variant="outline"
          onPress={() =>
            append({ ...emptyProduct, marketplaceIds: marketplaces.map((item) => item.source) })
          }
        >
          Add another product
        </Button>

        {marketplaces.length === 0 && (
          <AppText variant="error">
            No marketplace sources are enabled yet. Enable a source before creating a sourcing list.
          </AppText>
        )}
        {createMutation.isError && (
          <AppText variant="error">{getSourcingListErrorMessage(createMutation.error)}</AppText>
        )}
        <Button
          loading={createMutation.isPending}
          disabled={marketplaces.length === 0}
          onPress={handleSubmit(submit)}
        >
          Create sourcing list
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatMarketplaceName(source: string) {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
