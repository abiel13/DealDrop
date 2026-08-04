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
import { getAuthErrorMessage } from "../services/auth.service";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordScreen() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: ForgotPasswordFormValues) {
    setFormError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setFormError(getAuthErrorMessage(error.message));
      return;
    }

    setIsSent(true);
  }

  if (isSent) {
    return (
      <AuthShell
        title="Check your inbox."
        description="If an account exists for that email, we sent a link to reset your password."
      >
        <Button onPress={() => router.replace(authRoutes.login)}>Back to sign in</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password."
      description="Enter your email and we’ll send you a link to choose a new password."
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

        {formError && <AppText variant="error">{formError}</AppText>}

        <Button loading={isSubmitting} onPress={handleSubmit(onSubmit)}>
          Send reset link
        </Button>

        <Link href={authRoutes.login} asChild>
          <Pressable className="mt-4 items-center" hitSlop={8}>
            <AppText variant="bodySmall" className="font-semibold text-primary">
              Back to sign in
            </AppText>
          </Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}
