import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";

import { AuthShell } from "../components/AuthShell";
import { authRoutes } from "../routes";
import { ensureProfile, getAuthErrorMessage } from "../services/auth.service";
import { consumeFirstUseOnboarding } from "../services/first-use-onboarding";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const returnTo = getSafeReturnPath(params.returnTo);

  async function onSubmit({ email, password }: LoginFormValues) {
    setFormError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setFormError(getAuthErrorMessage(error.message));
      return;
    }

    if (data.user) {
      const { error: profileError } = await ensureProfile(data.user);

      if (profileError) {
        await supabase.auth.signOut();
        setFormError("We couldn't finish setting up your profile. Please try signing in again.");
        return;
      }

      trackProductEventNonBlocking("account_activated", {}, `account-activated:${data.user.id}`);

      if (!returnTo && (await consumeFirstUseOnboarding(data.user.id))) {
        router.replace("/watchlist-form?onboarding=true" as Href);
        return;
      }
    }

    router.replace(returnTo ?? authRoutes.home);
  }

  return (
    <AuthShell
      title="Welcome back."
      description="Sign in to keep your watchlists and deal alerts in one place."
    >
      <View className="gap-5">
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Password"
              placeholder="Enter your password"
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.password?.message}
            />
          )}
        />

        <View className="items-end">
          <Link href={authRoutes.forgotPassword} asChild>
            <Pressable hitSlop={8}>
              <AppText variant="bodySmall" className="font-semibold text-primary">
                Forgot password?
              </AppText>
            </Pressable>
          </Link>
        </View>

        {formError && <AppText variant="error">{formError}</AppText>}

        <Button loading={isSubmitting} onPress={handleSubmit(onSubmit)} className="mt-2">
          Sign in
        </Button>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <AppText variant="bodySmall">New to DealDrop?</AppText>
          <Link href={getAuthRouteWithReturn(authRoutes.register, returnTo)} asChild>
            <Pressable hitSlop={8}>
              <AppText variant="bodySmall" className="font-semibold text-primary">
                Create an account
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}

function getSafeReturnPath(value: string | string[] | undefined): Href | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return null;
  return candidate as Href;
}

function getAuthRouteWithReturn(route: Href, returnTo: Href | null) {
  return returnTo ? (`${route}?returnTo=${encodeURIComponent(String(returnTo))}` as Href) : route;
}
