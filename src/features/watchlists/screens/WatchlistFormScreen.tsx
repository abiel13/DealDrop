import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";

import type { MarketplaceSource, WatchlistAlertMode } from "@/services/api";

import {
  createWatchlist,
  getWatchlist,
  getWatchlistErrorMessage,
  getSupportedMarketplaces,
  updateWatchlist,
} from "../services/watchlist.service";
import type { WatchlistInput } from "../types/watchlist.types";
import {
  DEFAULT_WATCHLIST_FILTER_VALUES,
  getSelectedMarketplaces,
  getUnsupportedMarketplaceSources,
  splitFilterTerms,
  toWatchlistFilters,
  toWatchlistFilterValues,
} from "../utils/watchlist-filters";

const marketplaceSourceSchema = z.enum(["ebay", "etsy", "rakuten", "stockx"]);
const optionalNonNegativeNumberSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
    "Enter a valid non-negative number.",
  );
const optionalCurrencySchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[A-Za-z]{3}$/.test(value), "Use a 3-letter currency code.");

const watchlistSchema = z
  .object({
    name: z.string().trim().min(2, "Give your watchlist a name."),
    searchQuery: z.string().trim().min(2, "Enter something to search for."),
    marketplaceScope: z.enum(["selected", "all"]),
    marketplaceIds: z.array(marketplaceSourceSchema),
    alertMode: z.enum(["instant", "digest"]),
    aliases: z.string().trim().max(2_000, "Keep aliases under 2,000 characters."),
    excludedKeywords: z
      .string()
      .trim()
      .max(2_000, "Keep excluded keywords under 2,000 characters."),
    minPrice: optionalNonNegativeNumberSchema,
    maxPrice: optionalNonNegativeNumberSchema,
    currency: optionalCurrencySchema,
    conditions: z.array(z.string().trim().min(1).max(100)).max(20),
    location: z.string().trim().max(200, "Keep the location under 200 characters."),
    maxDistanceKm: optionalNonNegativeNumberSchema,
    latitude: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= -90 && Number(value) <= 90),
        "Enter a latitude between -90 and 90.",
      ),
    longitude: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= -180 && Number(value) <= 180),
        "Enter a longitude between -180 and 180.",
      ),
  })
  .superRefine((values, context) => {
    if (values.marketplaceScope === "selected" && values.marketplaceIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one marketplace.",
        path: ["marketplaceIds"],
      });
    }

    const aliases = splitFilterTerms(values.aliases);
    if (aliases.length > 20) {
      context.addIssue({
        code: "custom",
        message: "Add no more than 20 aliases.",
        path: ["aliases"],
      });
    }
    if (aliases.some((alias) => alias.length > 100)) {
      context.addIssue({
        code: "custom",
        message: "Keep each alias under 100 characters.",
        path: ["aliases"],
      });
    }

    const excludedKeywords = splitFilterTerms(values.excludedKeywords);
    if (excludedKeywords.length > 20) {
      context.addIssue({
        code: "custom",
        message: "Add no more than 20 excluded keywords.",
        path: ["excludedKeywords"],
      });
    }
    if (excludedKeywords.some((keyword) => keyword.length > 100)) {
      context.addIssue({
        code: "custom",
        message: "Keep each excluded keyword under 100 characters.",
        path: ["excludedKeywords"],
      });
    }

    if (values.maxDistanceKm !== "") {
      if (values.latitude === "") {
        context.addIssue({
          code: "custom",
          message: "Enter the center latitude for a distance filter.",
          path: ["latitude"],
        });
      }
      if (values.longitude === "") {
        context.addIssue({
          code: "custom",
          message: "Enter the center longitude for a distance filter.",
          path: ["longitude"],
        });
      }
    }

    if (values.latitude !== "" || values.longitude !== "") {
      if (values.maxDistanceKm === "") {
        context.addIssue({
          code: "custom",
          message: "Enter a maximum distance for the selected coordinates.",
          path: ["maxDistanceKm"],
        });
      }
    }

    if (
      values.minPrice !== "" &&
      values.maxPrice !== "" &&
      Number(values.minPrice) > Number(values.maxPrice)
    ) {
      context.addIssue({
        code: "custom",
        message: "Minimum price cannot be greater than maximum price.",
        path: ["maxPrice"],
      });
    }
  });

type WatchlistFormValues = z.infer<typeof watchlistSchema>;
const CONDITION_OPTIONS = ["new", "used", "refurbished", "like new", "open box"] as const;
const ALERT_MODE_OPTIONS: { value: WatchlistAlertMode; label: string; description: string }[] = [
  {
    value: "instant",
    label: "Instant",
    description: "Send each new match as soon as it is found.",
  },
  {
    value: "digest",
    label: "Digest",
    description: "Group matches found in the same monitoring run into one alert.",
  },
];

export function WatchlistFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const watchlistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isEditing = Boolean(watchlistId);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<WatchlistFormValues>({
    resolver: zodResolver(watchlistSchema),
    defaultValues: {
      name: "",
      searchQuery: "",
      marketplaceScope: "all",
      marketplaceIds: [],
      alertMode: "instant",
      ...DEFAULT_WATCHLIST_FILTER_VALUES,
    },
    mode: "onBlur",
  });

  const existingWatchlistQuery = useQuery({
    queryKey: ["watchlists", user?.id, watchlistId],
    queryFn: () => getWatchlist(watchlistId!),
    enabled: Boolean(user && watchlistId),
  });
  const marketplacesQuery = useQuery({
    queryKey: ["marketplaces"],
    queryFn: getSupportedMarketplaces,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
  const marketplaceScope = useWatch({ control, name: "marketplaceScope" });
  const marketplaceIds = useWatch({ control, name: "marketplaceIds" });
  const alertMode = useWatch({ control, name: "alertMode" });
  const minPrice = useWatch({ control, name: "minPrice" });
  const maxPrice = useWatch({ control, name: "maxPrice" });
  const currency = useWatch({ control, name: "currency" });
  const conditions = useWatch({ control, name: "conditions" });
  const location = useWatch({ control, name: "location" });
  const maxDistanceKm = useWatch({ control, name: "maxDistanceKm" });
  const latitude = useWatch({ control, name: "latitude" });
  const longitude = useWatch({ control, name: "longitude" });

  const selectedMarketplaces = useMemo(
    () => getSelectedMarketplaces(marketplaceScope, marketplaceIds, marketplacesQuery.data ?? []),
    [marketplaceIds, marketplaceScope, marketplacesQuery.data],
  );
  const unsupportedPriceSources = getUnsupportedMarketplaceSources(
    selectedMarketplaces,
    "supportsPriceFiltering",
  );
  const unsupportedLocationSources = getUnsupportedMarketplaceSources(
    selectedMarketplaces,
    "supportsLocation",
  );
  const unsupportedRadiusSources = getUnsupportedMarketplaceSources(
    selectedMarketplaces,
    "supportsRadius",
  );
  const unsupportedConditionSources = getUnsupportedMarketplaceSources(
    selectedMarketplaces,
    "supportsCondition",
  );
  const supportsRadius = selectedMarketplaces.some(
    (marketplace) => marketplace.capabilities?.supportsRadius === true,
  );
  const hasPriceFilter = Boolean(minPrice.trim() || maxPrice.trim() || currency.trim());
  const hasLocationFilter = Boolean(location.trim());
  const hasDistanceFilter = Boolean(maxDistanceKm.trim() || latitude.trim() || longitude.trim());
  const hasConditionFilter = conditions.length > 0;

  useEffect(() => {
    if (existingWatchlistQuery.data) {
      reset({
        name: existingWatchlistQuery.data.name,
        searchQuery: existingWatchlistQuery.data.search_query,
        marketplaceScope: existingWatchlistQuery.data.marketplace_scope,
        marketplaceIds: existingWatchlistQuery.data.marketplace_ids,
        alertMode: existingWatchlistQuery.data.alert_mode,
        ...toWatchlistFilterValues(existingWatchlistQuery.data.filters),
      });
    }
  }, [existingWatchlistQuery.data, reset]);

  function selectAllMarketplaces() {
    setValue("marketplaceScope", "all", { shouldValidate: true });
    setValue("marketplaceIds", [], { shouldValidate: true });
  }

  function toggleMarketplace(source: MarketplaceSource) {
    const nextIds = marketplaceIds.includes(source)
      ? marketplaceIds.filter((marketplaceId) => marketplaceId !== source)
      : [...marketplaceIds, source];

    if (nextIds.length === 0) {
      return;
    }

    setValue("marketplaceScope", "selected", { shouldValidate: true });
    setValue("marketplaceIds", nextIds, { shouldValidate: true });
  }

  function toggleCondition(condition: string) {
    const nextConditions = conditions.includes(condition)
      ? conditions.filter((value) => value !== condition)
      : [...conditions, condition];

    setValue("conditions", nextConditions, { shouldValidate: true });
  }

  function saveWatchlist(values: WatchlistFormValues) {
    const input: WatchlistInput = {
      name: values.name,
      searchQuery: values.searchQuery,
      filters: toWatchlistFilters(values),
      alertMode: values.alertMode,
      marketplaceScope: values.marketplaceScope,
      marketplaceIds: values.marketplaceIds,
    };

    saveMutation.mutate(input);
  }

  const saveMutation = useMutation({
    mutationFn: (input: WatchlistInput) => {
      if (!user) {
        throw new Error("You need to be signed in to manage watchlists.");
      }

      return isEditing ? updateWatchlist(watchlistId!, input) : createWatchlist(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["watchlists", user?.id] });
      router.replace(authRoutes.watchlists);
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (isEditing && existingWatchlistQuery.isLoading) {
    return <Loading />;
  }

  if (isEditing && existingWatchlistQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader title="Edit watchlist" onBack={() => router.back()} />
          <ErrorState
            title="Watchlist unavailable"
            description="We couldn't load this watchlist. Please go back and try again."
          />
          <Button variant="outline" onPress={() => router.back()}>
            Go back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <AppHeader
            title={isEditing ? "Edit watchlist" : "Create a watchlist"}
            subtitle={
              isEditing
                ? "Keep your monitor focused on the right search."
                : "Set up a search and DealDrop will watch for matching listings."
            }
            onBack={() => router.back()}
          />

          <Card padding="md" className="gap-5">
            <FormSectionHeader
              eyebrow="01"
              title="Name your monitor"
              description="Give this search a name you will recognize at a glance."
            />

            <Controller
              control={control}
              name="name"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Watchlist name"
                  placeholder="e.g. Camera gear"
                  leftIcon={<AppIcon name="star" size={18} color={theme.colors.textTertiary} />}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.name?.message}
                />
              )}
            />
          </Card>

          <Card padding="md" className="gap-5">
            <FormSectionHeader
              eyebrow="02"
              title="Choose what to watch"
              description="DealDrop will search your selected marketplaces for this term."
            />

            {marketplacesQuery.isLoading && <Loading size="small" />}

            {marketplacesQuery.isError && (
              <View className="gap-3">
                <ErrorState
                  title="Marketplaces unavailable"
                  description="We couldn't load the available marketplaces."
                />
                <Button variant="outline" onPress={() => void marketplacesQuery.refetch()}>
                  Try again
                </Button>
              </View>
            )}

            {marketplacesQuery.isSuccess && marketplacesQuery.data.length === 0 && (
              <ErrorState
                title="No marketplaces available"
                description="DealDrop cannot monitor this watchlist right now."
              />
            )}

            {marketplacesQuery.isSuccess && marketplacesQuery.data.length > 0 && (
              <View className="gap-3">
                <AppText variant="label">Marketplaces</AppText>
                <View className="flex-row flex-wrap gap-2">
                  <MarketplaceOption
                    label="All marketplaces"
                    selected={marketplaceScope === "all"}
                    onPress={selectAllMarketplaces}
                  />
                  {marketplacesQuery.data.map((marketplace) => (
                    <MarketplaceOption
                      key={marketplace.source}
                      label={formatMarketplaceName(marketplace.source)}
                      selected={
                        marketplaceScope === "selected" &&
                        marketplaceIds.includes(marketplace.source)
                      }
                      onPress={() => toggleMarketplace(marketplace.source)}
                    />
                  ))}
                </View>
                {errors.marketplaceIds?.message && (
                  <AppText variant="error">{errors.marketplaceIds.message}</AppText>
                )}
              </View>
            )}

            <Controller
              control={control}
              name="searchQuery"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Search term"
                  placeholder="e.g. Sony A7 III"
                  leftIcon={<AppIcon name="search" size={18} color={theme.colors.textTertiary} />}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.searchQuery?.message}
                />
              )}
            />
          </Card>

          <Card padding="md" className="gap-5">
            <FormSectionHeader
              eyebrow="03"
              title="Refine your matches"
              description="Add optional rules so DealDrop can filter out listings you do not want."
            />

            <View className="gap-3">
              <AppText variant="label">Price range</AppText>
              <View className="flex-row gap-3">
                <Controller
                  control={control}
                  name="minPrice"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Minimum"
                      placeholder="0"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.minPrice?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="maxPrice"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      className="flex-1"
                      label="Maximum"
                      placeholder="Any"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.maxPrice?.message}
                    />
                  )}
                />
              </View>

              <Controller
                control={control}
                name="currency"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Currency (optional)"
                    placeholder="e.g. USD"
                    autoCapitalize="characters"
                    maxLength={3}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.currency?.message}
                  />
                )}
              />

              {hasPriceFilter && (
                <UnsupportedFilterNotice
                  filterLabel="Price filters"
                  sources={unsupportedPriceSources}
                />
              )}
            </View>

            <View className="gap-3">
              <View className="gap-1">
                <AppText variant="label">Condition</AppText>
                <AppText variant="bodySmall">Choose any that apply.</AppText>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {CONDITION_OPTIONS.map((condition) => (
                  <FilterOption
                    key={condition}
                    label={formatCondition(condition)}
                    selected={conditions.includes(condition)}
                    onPress={() => toggleCondition(condition)}
                  />
                ))}
              </View>
              {hasConditionFilter && (
                <UnsupportedFilterNotice
                  filterLabel="Condition filters"
                  sources={unsupportedConditionSources}
                />
              )}
            </View>

            <View className="gap-3">
              <Controller
                control={control}
                name="aliases"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Also match these terms"
                    placeholder="e.g. ILCE-7M3, A7 III"
                    multiline
                    numberOfLines={2}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.aliases?.message}
                  />
                )}
              />
              <AppText variant="caption">
                Separate aliases with commas. They are useful for model numbers and alternate names.
              </AppText>

              <Controller
                control={control}
                name="excludedKeywords"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Exclude listings containing"
                    placeholder="e.g. case, cover, broken"
                    multiline
                    numberOfLines={2}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.excludedKeywords?.message}
                  />
                )}
              />
              <AppText variant="caption">
                Any listing containing one of these terms will be left out of your matches.
              </AppText>
            </View>

            <View className="gap-3">
              <Controller
                control={control}
                name="location"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Location (optional)"
                    placeholder="e.g. Lagos"
                    leftIcon={<AppIcon name="place" size={18} color={theme.colors.textTertiary} />}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.location?.message}
                  />
                )}
              />
              {hasLocationFilter && (
                <UnsupportedFilterNotice
                  filterLabel="Location filters"
                  sources={unsupportedLocationSources}
                />
              )}

              {supportsRadius || hasDistanceFilter ? (
                <>
                  <View className="flex-row gap-3">
                    <Controller
                      control={control}
                      name="maxDistanceKm"
                      render={({ field: { onBlur, onChange, value } }) => (
                        <Input
                          className="flex-1"
                          label="Maximum distance (km)"
                          placeholder="e.g. 25"
                          keyboardType="decimal-pad"
                          editable={supportsRadius}
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                          error={errors.maxDistanceKm?.message}
                        />
                      )}
                    />
                  </View>
                  <View className="flex-row gap-3">
                    <Controller
                      control={control}
                      name="latitude"
                      render={({ field: { onBlur, onChange, value } }) => (
                        <Input
                          className="flex-1"
                          label="Center latitude"
                          placeholder="e.g. 6.5244"
                          keyboardType="decimal-pad"
                          editable={supportsRadius}
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                          error={errors.latitude?.message}
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name="longitude"
                      render={({ field: { onBlur, onChange, value } }) => (
                        <Input
                          className="flex-1"
                          label="Center longitude"
                          placeholder="e.g. 3.3792"
                          keyboardType="decimal-pad"
                          editable={supportsRadius}
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                          error={errors.longitude?.message}
                        />
                      )}
                    />
                  </View>
                  {hasDistanceFilter && (
                    <UnsupportedFilterNotice
                      filterLabel="Distance filters"
                      sources={unsupportedRadiusSources}
                    />
                  )}
                </>
              ) : (
                <AppText variant="caption">
                  Maximum-distance filtering will appear when a selected marketplace supports radius
                  searches.
                </AppText>
              )}
            </View>
          </Card>

          <Card padding="md" className="gap-5">
            <FormSectionHeader
              eyebrow="04"
              title="Choose alert timing"
              description="Decide whether each match should arrive immediately or be grouped with other matches."
            />

            <View className="gap-3">
              {ALERT_MODE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: alertMode === option.value }}
                  className={`rounded-2xl border p-4 ${
                    alertMode === option.value
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface"
                  }`}
                  onPress={() => setValue("alertMode", option.value, { shouldValidate: true })}
                >
                  <View className="gap-1">
                    <AppText variant="label">{option.label}</AppText>
                    <AppText variant="bodySmall">{option.description}</AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>

          <View className="flex-row items-start gap-3 rounded-2xl bg-primary-soft p-4">
            <AppIcon name="info" size={19} color={theme.colors.primary} />
            <View className="flex-1 gap-1">
              <AppText variant="label">How matching works</AppText>
              <AppText variant="bodySmall">
                We compare your search term with new listings from the selected marketplaces and
                notify you when there is a match.
              </AppText>
            </View>
          </View>

          {saveMutation.isError && (
            <AppText variant="error">{getWatchlistErrorMessage(saveMutation.error)}</AppText>
          )}

          <View className="gap-3">
            <Button
              loading={saveMutation.isPending}
              disabled={
                marketplacesQuery.isLoading ||
                marketplacesQuery.isError ||
                marketplacesQuery.data?.length === 0
              }
              onPress={handleSubmit(saveWatchlist)}
            >
              {isEditing ? "Save changes" : "Create watchlist"}
            </Button>
            <Button variant="ghost" disabled={saveMutation.isPending} onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MarketplaceOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-2 rounded-full px-3 py-2.5 ${
        selected ? "bg-primary" : "bg-surface-muted"
      }`}
      onPress={onPress}
    >
      <AppIcon
        name={selected ? "check" : "storefront"}
        size={15}
        color={selected ? "white" : theme.colors.textSecondary}
      />
      <AppText
        variant="bodySmall"
        className={selected ? "font-semibold text-white" : "font-medium text-text-secondary"}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function FilterOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-2 rounded-full px-3 py-2.5 ${
        selected ? "bg-primary" : "bg-surface-muted"
      }`}
      onPress={onPress}
    >
      <AppIcon
        name={selected ? "check" : "tune"}
        size={15}
        color={selected ? "white" : theme.colors.textSecondary}
      />
      <AppText
        variant="bodySmall"
        className={selected ? "font-semibold text-white" : "font-medium text-text-secondary"}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function UnsupportedFilterNotice({
  filterLabel,
  sources,
}: {
  filterLabel: string;
  sources: MarketplaceSource[];
}) {
  const theme = useTheme();

  if (sources.length === 0) {
    return null;
  }

  return (
    <View className="flex-row items-start gap-2 rounded-2xl bg-error-soft p-3">
      <AppIcon name="warning" size={17} color={theme.colors.warning} />
      <AppText variant="caption" className="flex-1">
        {filterLabel} are not supported by {sources.map(formatMarketplaceName).join(", ")}. Those
        sources may return no matches for this rule.
      </AppText>
    </View>
  );
}

function formatCondition(condition: string) {
  return condition.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FormSectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View className="gap-1">
      <AppText variant="caption" className="font-semibold uppercase tracking-[1.5px] text-primary">
        {eyebrow}
      </AppText>
      <AppText variant="title">{title}</AppText>
      <AppText variant="bodySmall">{description}</AppText>
    </View>
  );
}
