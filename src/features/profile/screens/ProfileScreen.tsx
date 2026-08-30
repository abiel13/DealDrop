import { Alert, Linking, Pressable, Switch, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Divider } from "@/components/ui/Divider";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import type { AppIconName } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { getWeeklySummary } from "@/features/analytics/services/analytics.service";
import { shouldShowWeeklySummary } from "@/features/analytics/utils/weekly-summary-navigation";
import { authRoutes } from "@/features/auth/routes";
import { getAuthErrorMessage } from "@/features/auth/services/auth.service";
import { usePremium } from "@/features/premium/hooks/PremiumProvider";
import { usePro } from "@/features/pro/hooks/ProProvider";
import { hasPremiumEntitlement } from "@/features/premium/services/premium.service";
import { getPremiumErrorMessage } from "@/features/premium/utils/premium-errors";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";
import { getWorkspaces } from "@/features/workspaces/services/workspace.service";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/providers/ThemeProvider";

import type { ApiMarketplace, ApiShoppingPreferences } from "@/services/api";

import {
  deleteAccount,
  getOrCreateProfile,
  getShoppingMarketplaces,
  getShoppingPreferences,
  updateProfileName,
  updateShoppingPreferences,
} from "../services/profile.service";
import { getAccountLinks } from "../utils/legal-links";

function ProfileSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="gap-6 px-5 pb-8 pt-6">
        <View className="gap-2">
          <View className="h-3 w-20 rounded-full bg-background-muted" />
          <View className="h-9 w-32 rounded-xl bg-background-muted" />
        </View>
        <View className="flex-row items-center gap-4">
          <View className="h-16 w-16 rounded-full bg-background-muted" />
          <View className="gap-2">
            <View className="h-5 w-40 rounded-full bg-background-muted" />
            <View className="h-4 w-52 rounded-full bg-background-muted" />
          </View>
        </View>
        <View className="h-14 rounded-2xl bg-background-muted" />
        <View className="h-28 rounded-3xl bg-background-muted" />
        <View className="gap-5">
          <View className="h-5 w-32 rounded-full bg-background-muted" />
          <View className="h-14 rounded-2xl bg-background-muted" />
          <View className="h-px w-full bg-background-muted" />
          <View className="h-14 rounded-2xl bg-background-muted" />
        </View>
      </View>
    </SafeAreaView>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const premium = usePremium();
  const pro = usePro();
  const theme = useTheme();
  const accountLinks = getAccountLinks();
  const [editedName, setEditedName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [shoppingDraft, setShoppingDraft] = useState<ApiShoppingPreferences | null>(null);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);

  const profileQueryKey = ["profile", user?.id] as const;
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => getOrCreateProfile(user!),
    enabled: Boolean(user),
  });
  const weeklySummaryQuery = useQuery({
    queryKey: ["weekly-summary", user?.id],
    queryFn: getWeeklySummary,
    enabled: Boolean(user),
    retry: false,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces", user?.id],
    queryFn: getWorkspaces,
    enabled: Boolean(user && pro.access?.isPro),
  });
  const shoppingPreferencesQuery = useQuery({
    queryKey: ["shopping-preferences", user?.id],
    queryFn: getShoppingPreferences,
    enabled: Boolean(user),
  });
  const shoppingMarketplacesQuery = useQuery({
    queryKey: ["marketplaces"],
    queryFn: getShoppingMarketplaces,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => updateProfileName(user!.id, name),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey, profile);
      setEditedName(profile.full_name ?? "");
    },
    onError: () => setActionError("We couldn't update your name. Please try again."),
  });
  const shoppingPreferencesMutation = useMutation({
    mutationFn: (preferences: ApiShoppingPreferences) => updateShoppingPreferences(preferences),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["shopping-preferences", user?.id], preferences);
      setShoppingDraft(preferences);
      setActionError(null);
    },
    onError: () => setActionError("We couldn't save your shopping preferences."),
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (profileQuery.isLoading) {
    return <ProfileSkeleton />;
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <View className="gap-1">
            <AppText
              variant="caption"
              className="font-semibold uppercase tracking-[2px] text-primary"
            >
              Account
            </AppText>
            <AppText variant="heading">Profile</AppText>
          </View>
          <ErrorState
            title="Couldn't load your profile"
            description="Please check your connection and try again."
          />
          <Button variant="outline" onPress={() => void profileQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const profile = profileQuery.data;
  const displayName = profile.full_name || user.email?.split("@")[0] || "DealDrop user";
  const nameValue = editedName ?? profile.full_name ?? displayName;
  const shoppingPreferences = shoppingDraft ?? shoppingPreferencesQuery.data ?? null;
  const shoppingMarketplaces =
    shoppingMarketplacesQuery.data?.filter((marketplace) => marketplace.enabled) ?? [];

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setActionError("We couldn't open that link. Please try again later.");
    }
  }

  async function handleManageSubscription() {
    setActionError(null);
    setActionMessage(null);
    setIsManagingSubscription(true);

    try {
      await premium.manageSubscription();
    } catch {
      setActionError("We couldn't open subscription management. Please try again later.");
    } finally {
      setIsManagingSubscription(false);
    }
  }

  async function handleRestorePurchases() {
    setActionError(null);
    setActionMessage(null);
    setIsRestoringPurchases(true);

    try {
      const customerInfo = await premium.restorePurchases();
      if (customerInfo && hasPremiumEntitlement(customerInfo)) {
        setActionMessage("Your Premium subscription was restored for this account.");
      } else {
        setActionError("No active Premium subscription was found for this account.");
      }
    } catch (restoreError) {
      setActionError(
        getPremiumErrorMessage(
          restoreError,
          "We couldn't restore your subscription. Please try again later.",
        ),
      );
    } finally {
      setIsRestoringPurchases(false);
    }
  }

  async function handleSignOut() {
    setActionError(null);
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      setActionError(getAuthErrorMessage(error.message));
      return;
    }

    router.replace(authRoutes.welcome);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your profile, watchlists, matches, and notifications.",
      [
        { text: "Keep account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => void handleDeleteAccount(),
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    setActionError(null);
    setIsDeleting(true);

    try {
      await deleteAccount();
      await supabase.auth.signOut();
      router.replace(authRoutes.welcome);
    } catch {
      setActionError("We couldn't delete your account. Please try again later.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-6 px-5 pb-10 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <AppText
            variant="caption"
            className="font-semibold uppercase tracking-[2px] text-primary"
          >
            Account
          </AppText>
          <AppText variant="heading">Profile</AppText>
          <AppText variant="bodySmall">Manage your account and DealDrop preferences.</AppText>
        </View>

        <View className="gap-5">
          <View className="flex-row items-center gap-4">
            <Avatar uri={profile.avatar_url ?? undefined} fallback={displayName} size="lg" />
            <View className="flex-1 gap-1">
              <AppText variant="title" numberOfLines={1}>
                {displayName}
              </AppText>
              <AppText variant="bodySmall" numberOfLines={1}>
                {profile.email ?? user.email ?? "Email unavailable"}
              </AppText>
            </View>
          </View>

          <View className="gap-3">
            <Input label="Name" value={nameValue} onChangeText={setEditedName} />
            <Button
              variant="secondary"
              loading={updateNameMutation.isPending}
              disabled={
                !nameValue.trim() || nameValue.trim() === (profile.full_name ?? displayName)
              }
              onPress={() => {
                setActionError(null);
                updateNameMutation.mutate(nameValue);
              }}
            >
              Save name
            </Button>
          </View>
        </View>

        <Card padding="md" className="gap-4 bg-primary-soft">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
              <AppIcon name="star" size={21} color={theme.colors.primary} weight="bold" />
            </View>
            <View className="flex-1 gap-1">
              <AppText variant="title">
                {premium.isPremium ? "Premium active" : "Premium access"}
              </AppText>
              <AppText variant="bodySmall">
                {premium.isPremium
                  ? "Your watchlists, matches, and alerts are unlocked."
                  : "Manage your subscription to continue using DealDrop."}
              </AppText>
            </View>
          </View>
          <View className="gap-3">
            <Button
              variant="primary"
              loading={isManagingSubscription}
              disabled={isRestoringPurchases}
              onPress={() => void handleManageSubscription()}
            >
              Manage subscription
            </Button>
            <Button
              variant="outline"
              loading={isRestoringPurchases}
              disabled={isManagingSubscription}
              onPress={() => void handleRestorePurchases()}
            >
              Restore purchases
            </Button>
          </View>
        </Card>

        {actionMessage && <AppText className="text-primary">{actionMessage}</AppText>}

        <AccountSection title="Business sourcing">
          {!pro.access?.isPro ? (
            <AccountRow
              icon="storefront"
              title="Explore DealDrop Pro"
              subtitle="Source across marketplaces with a professional workspace"
              onPress={() => router.push(authRoutes.proUpgrade)}
            />
          ) : workspacesQuery.isError ? (
            <AccountRow
              icon="storefront"
              title="Workspace unavailable"
              subtitle="Tap to try again"
              onPress={() => void workspacesQuery.refetch()}
            />
          ) : workspacesQuery.data && workspacesQuery.data.length > 0 ? (
            <>
              <AccountRow
                icon="person"
                title="Personal DealDrop"
                subtitle={
                  activeWorkspaceId
                    ? "Switch back to your personal searches"
                    : "Your personal watchlists and saved listings"
                }
                onPress={() => {
                  setActiveWorkspaceId(null);
                  router.replace(authRoutes.home);
                }}
              />
              {workspacesQuery.data.map((workspace, index) => (
                <View key={workspace.id}>
                  {index > 0 && <Divider />}
                  <AccountRow
                    icon="storefront"
                    title={workspace.name}
                    subtitle={`${workspace.businessType} · ${workspace.role}`}
                    onPress={() => {
                      setActiveWorkspaceId(workspace.id);
                      router.push(authRoutes.workspace);
                    }}
                  />
                </View>
              ))}
            </>
          ) : (
            <AccountRow
              icon="storefront"
              title="Create a Pro workspace"
              subtitle="Keep business sourcing separate from your personal DealDrop"
              onPress={() => router.push(authRoutes.workspace)}
            />
          )}
        </AccountSection>

        {weeklySummaryQuery.data && shouldShowWeeklySummary(weeklySummaryQuery.data) && (
          <AccountSection title="Insights">
            <AccountRow
              icon="refresh"
              title="Weekly summary"
              subtitle="Review your latest watchlist activity"
              onPress={() => router.push(authRoutes.weeklySummary)}
            />
          </AccountSection>
        )}

        <AccountSection title="Preferences">
          <AccountRow
            icon="notifications"
            title="Notification settings"
            subtitle="Choose how DealDrop alerts you"
            onPress={() => router.push(authRoutes.notifications)}
          />
          <Divider />
          {shoppingPreferencesQuery.isError ? (
            <AccountRow
              icon="settings"
              title="Shopping preferences unavailable"
              subtitle="Tap to try again"
              onPress={() => {
                void shoppingPreferencesQuery.refetch();
                void shoppingMarketplacesQuery.refetch();
              }}
            />
          ) : shoppingPreferences ? (
            <ShoppingPreferencesEditor
              preferences={shoppingPreferences}
              marketplaces={shoppingMarketplaces}
              saving={shoppingPreferencesMutation.isPending}
              onChange={setShoppingDraft}
              onSave={(next) => shoppingPreferencesMutation.mutate(next)}
            />
          ) : (
            <AppText variant="bodySmall">Loading shopping preferences…</AppText>
          )}
          <Divider />
          <ThemeRow />
        </AccountSection>

        {(accountLinks.privacy || accountLinks.terms || accountLinks.support) && (
          <AccountSection title="Support & legal">
            {accountLinks.privacy && (
              <AccountRow
                icon="lock"
                title="Privacy policy"
                onPress={() => void openLink(accountLinks.privacy!)}
              />
            )}
            {accountLinks.privacy && accountLinks.terms && <Divider />}
            {accountLinks.terms && (
              <AccountRow
                icon="info"
                title="Terms of service"
                onPress={() => void openLink(accountLinks.terms!)}
              />
            )}
            {(accountLinks.privacy || accountLinks.terms) && accountLinks.support && <Divider />}
            {accountLinks.support && (
              <AccountRow
                icon="mail"
                title="Support"
                subtitle="Get help with your account"
                onPress={() => void openLink(accountLinks.support!)}
              />
            )}
          </AccountSection>
        )}

        <View className="gap-3">
          <SectionHeading title="Account" />
          {actionError && <AppText variant="error">{actionError}</AppText>}
          <Button variant="outline" loading={isSigningOut} onPress={() => void handleSignOut()}>
            Sign out
          </Button>
          <Button
            variant="danger"
            loading={isDeleting}
            disabled={isSigningOut}
            onPress={confirmDeleteAccount}
          >
            Delete account
          </Button>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function AccountSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <SectionHeading title={title} />
      <View>{children}</View>
    </View>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <AppText variant="label" className="text-text-secondary">
      {title}
    </AppText>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: AppIconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center gap-3 py-4 active:bg-surface-muted"
      onPress={onPress}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
        <AppIcon name={icon} size={19} color={theme.colors.primary} />
      </View>
      <View className="flex-1 gap-1">
        <AppText className="font-semibold text-text">{title}</AppText>
        {subtitle && <AppText variant="caption">{subtitle}</AppText>}
      </View>
      <AppIcon name="arrow-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

function ShoppingPreferencesEditor({
  preferences,
  marketplaces,
  saving,
  onChange,
  onSave,
}: {
  preferences: ApiShoppingPreferences;
  marketplaces: ApiMarketplace[];
  saving: boolean;
  onChange: (preferences: ApiShoppingPreferences) => void;
  onSave: (preferences: ApiShoppingPreferences) => void;
}) {
  const theme = useTheme();
  const selectedMarketplaces =
    preferences.preferredMarketplaces.length > 0
      ? preferences.preferredMarketplaces
      : marketplaces.map((marketplace) => marketplace.source);

  function toggleMarketplace(source: ApiMarketplace["source"]) {
    const nextMarketplaces = selectedMarketplaces.includes(source)
      ? selectedMarketplaces.filter((selected) => selected !== source)
      : [...selectedMarketplaces, source];
    onChange({ ...preferences, preferredMarketplaces: nextMarketplaces });
  }

  return (
    <View className="gap-4 py-4">
      <View className="gap-1">
        <AppText className="font-semibold text-text">Shopping preferences</AppText>
        <AppText variant="caption">
          Set the country, currency, and sources DealDrop should use for new searches.
        </AppText>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input
            label="Country"
            value={preferences.country}
            maxLength={2}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(country) => onChange({ ...preferences, country: country.toUpperCase() })}
          />
        </View>
        <View className="flex-1">
          <Input
            label="Currency"
            value={preferences.preferredCurrency}
            maxLength={3}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(preferredCurrency) =>
              onChange({ ...preferences, preferredCurrency: preferredCurrency.toUpperCase() })
            }
          />
        </View>
      </View>

      <View className="gap-2">
        <AppText variant="label">Preferred marketplaces</AppText>
        <View className="flex-row flex-wrap gap-2">
          {marketplaces.map((marketplace) => {
            const selected = selectedMarketplaces.includes(marketplace.source);
            return (
              <Pressable
                key={marketplace.source}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-full px-3 py-2 ${selected ? "bg-primary" : "bg-surface-muted"}`}
                onPress={() => toggleMarketplace(marketplace.source)}
              >
                <AppText
                  variant="caption"
                  className={selected ? "font-semibold text-white" : "text-text-secondary"}
                >
                  {formatMarketplaceName(marketplace.source)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <AppText className="font-semibold text-text">Buy internationally</AppText>
          <AppText variant="caption">
            Keep international sources and rank local sources first when disabled.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Allow international shopping"
          value={preferences.willingToBuyInternationally}
          onValueChange={(willingToBuyInternationally) =>
            onChange({ ...preferences, willingToBuyInternationally })
          }
          trackColor={{ false: theme.colors.backgroundMuted, true: theme.colors.primary }}
          thumbColor={theme.colors.surface}
        />
      </View>

      <Button
        variant="secondary"
        loading={saving}
        disabled={saving || selectedMarketplaces.length === 0}
        onPress={() => onSave({ ...preferences, preferredMarketplaces: selectedMarketplaces })}
      >
        Save shopping preferences
      </Button>
    </View>
  );
}

function ThemeRow() {
  const theme = useTheme();
  const isDark = theme.mode === "dark";

  return (
    <View className="flex-row items-center gap-3 py-4">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
        <AppIcon name="settings" size={19} color={theme.colors.primary} />
      </View>
      <View className="flex-1 gap-1">
        <AppText className="font-semibold text-text">Dark mode</AppText>
        <AppText variant="caption">Use a dark background throughout the app</AppText>
      </View>
      <Switch
        accessibilityLabel="Toggle dark mode"
        value={isDark}
        onValueChange={() => void theme.toggleMode()}
        trackColor={{ false: theme.colors.backgroundMuted, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}
