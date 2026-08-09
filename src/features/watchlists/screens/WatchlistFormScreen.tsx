import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
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
import { appColors } from "@/styles/colors";

import {
  createWatchlist,
  getWatchlist,
  getWatchlistErrorMessage,
  updateWatchlist,
} from "../services/watchlist.service";
import type { WatchlistInput } from "../types/watchlist.types";

const watchlistSchema = z.object({
  name: z.string().trim().min(2, "Give your watchlist a name."),
  searchQuery: z.string().trim().min(2, "Enter something to search for."),
});

type WatchlistFormValues = z.infer<typeof watchlistSchema>;

export function WatchlistFormScreen() {
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
    formState: { errors },
  } = useForm<WatchlistFormValues>({
    resolver: zodResolver(watchlistSchema),
    defaultValues: { name: "", searchQuery: "" },
    mode: "onBlur",
  });

  const existingWatchlistQuery = useQuery({
    queryKey: ["watchlists", user?.id, watchlistId],
    queryFn: () => getWatchlist(watchlistId!),
    enabled: Boolean(user && watchlistId),
  });

  useEffect(() => {
    if (existingWatchlistQuery.data) {
      reset({
        name: existingWatchlistQuery.data.name,
        searchQuery: existingWatchlistQuery.data.search_query,
      });
    }
  }, [existingWatchlistQuery.data, reset]);

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
                  leftIcon={<AppIcon name="star" size={18} color={appColors.textTertiary} />}
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
              description="DealDrop will search this marketplace for your term."
            />

            <Input
              label="Marketplace"
              value="Facebook Marketplace"
              editable={false}
              leftIcon={<AppIcon name="storefront" size={18} color={appColors.textTertiary} />}
            />

            <Controller
              control={control}
              name="searchQuery"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Search term"
                  placeholder="e.g. Sony A7 III"
                  leftIcon={<AppIcon name="search" size={18} color={appColors.textTertiary} />}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.searchQuery?.message}
                />
              )}
            />
          </Card>

          <View className="flex-row items-start gap-3 rounded-2xl bg-primary-soft p-4">
            <AppIcon name="info" size={19} color={appColors.primary} />
            <View className="flex-1 gap-1">
              <AppText variant="label">How matching works</AppText>
              <AppText variant="bodySmall">
                We compare your search term with new Facebook Marketplace listings and notify you
                when there is a match.
              </AppText>
            </View>
          </View>

          {saveMutation.isError && (
            <AppText variant="error">{getWatchlistErrorMessage(saveMutation.error)}</AppText>
          )}

          <View className="gap-3">
            <Button
              loading={saveMutation.isPending}
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
