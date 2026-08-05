import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";
import { supabase } from "@/lib/supabase";

import { AuthShell } from "../components/AuthShell";
import { authRoutes } from "../routes";
import { ensureProfile, getAuthErrorMessage } from "../services/auth.service";

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(6, "Use at least 6 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterScreen() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit({ fullName, email, password }: RegisterFormValues) {
    setFormError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    if (error) {
      setFormError(getAuthErrorMessage(error.message));
      return;
    }

    if (data.session && data.user) {
      const { error: profileError } = await ensureProfile(data.user, { fullName });

      if (profileError) {
        setFormError(
          "Your account was created, but we could not finish your profile. Please try signing in.",
        );
        return;
      }

      router.replace(authRoutes.home);
      return;
    }

    setConfirmationMessage("Check your email to confirm your account, then sign in to DealDrop.");
  }

  if (confirmationMessage) {
    return (
      <AuthShell title="Check your inbox." description={confirmationMessage}>
        <Button onPress={() => router.replace(authRoutes.login)}>Back to sign in</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start finding better deals."
      description="Create an account to save searches and let DealDrop watch the marketplace for you."
    >
      <View className="gap-5">
        <Controller
          control={control}
          name="fullName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Name"
              placeholder="Your name"
              autoComplete="name"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.fullName?.message}
            />
          )}
        />

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
              placeholder="At least 6 characters"
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Confirm password"
              placeholder="Re-enter your password"
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        {formError && <AppText variant="error">{formError}</AppText>}

        <Button loading={isSubmitting} onPress={handleSubmit(onSubmit)} className="mt-2">
          Create account
        </Button>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <AppText variant="bodySmall">Already have an account?</AppText>
          <Link href={authRoutes.login} asChild>
            <Pressable hitSlop={8}>
              <AppText variant="bodySmall" className="font-semibold text-primary">
                Sign in
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
