import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useRouter } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { AppText } from "@/components/ui/Text";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, dealRoomRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";

import { createDealRoom, getDealRoomErrorMessage } from "../services/deal-room.service";
import type { DealRoomInput } from "../types/deal-room.types";

const dealRoomFormSchema = z.object({
  name: z.string().trim().min(2, "Give your Deal Room a name."),
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
  coverImageUrl: z
    .string()
    .trim()
    .url("Enter a valid image URL.")
    .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS image URL.")
    .or(z.literal("")),
  visibility: z.enum(["private", "public"]),
});

type DealRoomFormValues = z.infer<typeof dealRoomFormSchema>;

export function DealRoomFormScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<DealRoomFormValues>({
    resolver: zodResolver(dealRoomFormSchema),
    defaultValues: {
      name: "",
      description: "",
      coverImageUrl: "",
      visibility: "private",
    },
    mode: "onBlur",
  });
  const visibility = useWatch({ control, name: "visibility" });

  const createMutation = useMutation({
    mutationFn: (input: DealRoomInput) => createDealRoom(input),
    onSuccess: (room) => {
      trackProductEventNonBlocking(
        "deal_room_created",
        { dealRoomId: room.id, visibility: room.visibility },
        `deal-room-created:${room.id}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["deal-rooms", user?.id] });
      router.replace(dealRoomRoute(room.id));
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  function submit(values: DealRoomFormValues) {
    createMutation.mutate({
      name: values.name,
      description: values.description || null,
      coverImageUrl: values.coverImageUrl || null,
      visibility: values.visibility,
    });
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
          title="Create a Deal Room"
          subtitle="Collect products and deals around something you are planning or shopping for."
          onBack={() => router.back()}
        />

        <Card padding="md" className="gap-4 bg-primary-soft">
          <AppText variant="title">A collection, not another watchlist</AppText>
          <AppText variant="bodySmall">
            Add saved products, tracked products, and selected deals without changing the original
            items.
          </AppText>
        </Card>

        <View className="gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                autoCapitalize="words"
                autoCorrect={false}
                error={errors.name?.message}
                label="Room name"
                placeholder="e.g. Camera setup"
                returnKeyType="next"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                error={errors.description?.message}
                label="Description (optional)"
                multiline
                numberOfLines={4}
                placeholder="What are you collecting for?"
                textAlignVertical="top"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="coverImageUrl"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.coverImageUrl?.message}
                label="Cover image URL (optional)"
                keyboardType="url"
                placeholder="https://..."
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />

          <View className="gap-2">
            <AppText variant="label">Visibility</AppText>
            <View className="flex-row gap-3">
              <VisibilityOption
                selected={visibility === "private"}
                title="Private"
                description="Only you can see it"
                onPress={() => setValue("visibility", "private", { shouldDirty: true })}
              />
              <VisibilityOption
                selected={visibility === "public"}
                title="Public"
                description="Anyone with the link can view it"
                onPress={() => setValue("visibility", "public", { shouldDirty: true })}
              />
            </View>
          </View>
        </View>

        {createMutation.isError && (
          <AppText variant="error">{getDealRoomErrorMessage(createMutation.error)}</AppText>
        )}

        <Button loading={createMutation.isPending} onPress={handleSubmit(submit)}>
          Create Deal Room
        </Button>
        <Button variant="ghost" disabled={createMutation.isPending} onPress={() => router.back()}>
          Cancel
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function VisibilityOption({
  selected,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 gap-1 rounded-2xl border p-3 ${
        selected ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
      onPress={onPress}
    >
      <AppText variant="bodySmall" className={selected ? "font-semibold text-primary" : ""}>
        {title}
      </AppText>
      <AppText variant="caption">{description}</AppText>
    </Pressable>
  );
}
