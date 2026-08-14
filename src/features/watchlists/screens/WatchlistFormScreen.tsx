import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
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
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";

import {
  createWatchlist,
  getWatchlist,
  getWatchlistErrorMessage,
  getSupportedMarketplaces,
  updateWatchlist,
} from "../services/watchlist.service";
import type { MarketplaceSource } from "@/services/api";

import type { WatchlistInput } from "../types/watchlist.types";

const marketplaceSourceSchema = z.enum(["ebay", "etsy", "rakuten", "stockx"]);
const watchlistSchema = z
  .object({
    name: z.string().trim().min(2, "Give your watchlist a name."),
    searchQuery: z.string().trim().min(2, "Enter something to search for."),
    marketplaceScope: z.enum(["selected", "all"]),
    marketplaceIds: z.array(marketplaceSourceSchema),
  })
  .superRefine((values, context) => {
    if (values.marketplaceScope === "selected" && values.marketplaceIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one marketplace.",
        path: ["marketplaceIds"],
      });
    }
  });

type WatchlistFormValues = z.infer<typeof watchlistSchema>;

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
    defaultValues: { name: "", searchQuery: "", marketplaceScope: "all", marketplaceIds: [] },
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

  useEffect(() => {
    if (existingWatchlistQuery.data) {
      reset({
        name: existingWatchlistQuery.data.name,
        searchQuery: existingWatchlistQuery.data.search_query,
        marketplaceScope: existingWatchlistQuery.data.marketplace_scope,
        marketplaceIds: existingWatchlistQuery.data.marketplace_ids,
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
              onPress={handleSubmit((values) => saveMutation.mutate(values))}
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
