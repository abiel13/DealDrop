import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

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
  });

  const existingWatchlistQuery = useQuery({
    queryKey: ["watchlists", user?.id, watchlistId],
    queryFn: () => getWatchlist(user!.id, watchlistId!),
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

      return isEditing
        ? updateWatchlist(user.id, watchlistId!, input)
        : createWatchlist(user.id, input);
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
      <SafeAreaView className="flex-1 bg-background px-6">
        <ErrorState
          title="Watchlist unavailable"
          description="We couldn't load this watchlist. Please go back and try again."
        />
        <Button variant="outline" onPress={() => router.back()}>
          Go back
        </Button>
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
          contentContainerClassName="grow px-5 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <AppHeader
            title={isEditing ? "Edit watchlist" : "Create a watchlist"}
            subtitle="DealDrop will use these details to find matching listings."
            onBack={() => router.back()}
          />

          <View className="mt-8 gap-5">
            <Input label="Marketplace" value="Facebook Marketplace" editable={false} />

            <Controller
              control={control}
              name="name"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Watchlist name"
                  placeholder="e.g. Camera gear"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.name?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="searchQuery"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Search for"
                  placeholder="e.g. Sony A7 III"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.searchQuery?.message}
                />
              )}
            />

            {saveMutation.isError && (
              <AppText variant="error">{getWatchlistErrorMessage(saveMutation.error)}</AppText>
            )}

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
