import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { AppIcon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useTheme } from "@/providers/ThemeProvider";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";
import { ProUpgradeScreen } from "@/features/pro/screens/ProUpgradeScreen";
import { usePro } from "@/features/pro/hooks/ProProvider";

import {
  createWorkspace,
  getWorkspaceMembers,
  getWorkspaceErrorMessage,
  getWorkspaces,
  inviteWorkspaceMember,
} from "../services/workspace.service";
import { useWorkspaceStore } from "../store/workspace.store";
import type { Workspace, WorkspaceInput } from "../types/workspace.types";
import type { ApiWorkspaceMember, ApiWorkspaceRole } from "@/services/api";

const workspaceFormSchema = z.object({
  name: z.string().trim().min(2, "Enter a business name."),
  businessType: z.string().trim().min(2, "Tell us what kind of business this is."),
  primarySourcingCategories: z.string().trim().min(2, "Add at least one sourcing category."),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code."),
  countryRegion: z.string().trim().min(2, "Enter a country or region."),
});

type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

export function WorkspaceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const pro = usePro();
  const userId = user?.id ?? "";
  const workspaceQueryKey = ["workspaces", userId] as const;
  const workspacesQuery = useQuery({
    queryKey: workspaceQueryKey,
    queryFn: getWorkspaces,
    enabled: Boolean(userId && pro.access?.isPro),
  });

  useEffect(() => {
    if (pro.access?.isPro) {
      trackProductEventNonBlocking("pro_feature_used", { feature: "business_workspace" });
    }
  }, [pro.access?.isPro]);

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  if (pro.isLoading) {
    return <Loading />;
  }

  if (!pro.access?.isPro) {
    return (
      <ProUpgradeScreen surface="workspace" onBack={() => router.back()} onRetry={pro.refresh} />
    );
  }

  if (workspacesQuery.isLoading) {
    return <Loading />;
  }

  if (workspacesQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background px-5">
        <View className="flex-1 gap-5 pt-6">
          <AppHeader
            title="Pro workspace"
            subtitle="A secure home for your business sourcing work."
            onBack={() => router.back()}
          />
          <ErrorState
            title="Couldn't load your workspaces"
            description="Please check your connection and try again."
          />
          <Button variant="outline" onPress={() => void workspacesQuery.refetch()}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const workspaces = workspacesQuery.data ?? [];
  return workspaces.length > 0 ? (
    <WorkspaceOverview
      workspaces={workspaces}
      onBack={() => router.back()}
      onOpenSourcingLists={() => router.push(authRoutes.sourcingLists)}
      onOpenSuppliers={() => router.push(authRoutes.suppliers)}
      onSwitchToPersonal={() => {
        useWorkspaceStore.getState().setActiveWorkspaceId(null);
        router.replace(authRoutes.home);
      }}
    />
  ) : (
    <WorkspaceOnboarding workspaceQueryKey={workspaceQueryKey} onBack={() => router.back()} />
  );
}

function WorkspaceOnboarding({
  workspaceQueryKey,
  onBack,
}: {
  workspaceQueryKey: readonly [string, string];
  onBack: () => void;
}) {
  const theme = useTheme();
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const queryClient = useQueryClient();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      name: "",
      businessType: "",
      primarySourcingCategories: "",
      defaultCurrency: "",
      countryRegion: "",
    },
    mode: "onBlur",
  });

  const createMutation = useMutation({
    mutationFn: (input: WorkspaceInput) => createWorkspace(input),
    onSuccess: (workspace) => {
      setActiveWorkspaceId(workspace.id);
      queryClient.setQueryData<Workspace[]>(workspaceQueryKey, [workspace]);
    },
  });

  function submit(values: WorkspaceFormValues) {
    const input: WorkspaceInput = {
      name: values.name,
      businessType: values.businessType,
      primarySourcingCategories: [
        ...new Set(
          values.primarySourcingCategories
            .split(",")
            .map((category) => category.trim())
            .filter(Boolean),
        ),
      ],
      defaultCurrency: values.defaultCurrency.toUpperCase(),
      countryRegion: values.countryRegion,
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
          title="Set up your Pro workspace"
          subtitle="Tell us only what we need to get your business sourcing space ready."
          onBack={onBack}
        />

        <Card padding="md" className="gap-5 bg-primary-soft">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-surface">
              <AppIcon name="storefront" size={21} color={theme.colors.primary} weight="bold" />
            </View>
            <View className="flex-1 gap-1">
              <AppText variant="title">A workspace for business sourcing</AppText>
              <AppText variant="bodySmall">
                Your sourcing lists, supplier notes, comparisons, and activity will belong to this
                workspace—not your personal DealDrop account.
              </AppText>
            </View>
          </View>
        </Card>

        <Card padding="md" className="gap-5">
          <Controller
            control={control}
            name="name"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Business name"
                placeholder="e.g. Apex Electronics"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="businessType"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Business type"
                placeholder="e.g. Reseller, retailer, or D2C brand"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.businessType?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="primarySourcingCategories"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Primary sourcing categories"
                placeholder="e.g. Electronics, footwear"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.primarySourcingCategories?.message}
              />
            )}
          />

          <View className="flex-row gap-3">
            <Controller
              control={control}
              name="defaultCurrency"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  className="flex-1"
                  label="Default currency"
                  placeholder="USD"
                  autoCapitalize="characters"
                  maxLength={3}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.defaultCurrency?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="countryRegion"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  className="flex-1"
                  label="Country or region"
                  placeholder="e.g. Nigeria"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.countryRegion?.message}
                />
              )}
            />
          </View>
        </Card>

        {createMutation.isError && (
          <AppText variant="error">{getWorkspaceErrorMessage(createMutation.error)}</AppText>
        )}

        <Button loading={createMutation.isPending} onPress={handleSubmit(submit)}>
          Create workspace
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function WorkspaceOverview({
  workspaces,
  onBack,
  onOpenSourcingLists,
  onOpenSuppliers,
  onSwitchToPersonal,
}: {
  workspaces: Workspace[];
  onBack: () => void;
  onOpenSourcingLists: () => void;
  onOpenSuppliers: () => void;
  onSwitchToPersonal: () => void;
}) {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!activeWorkspaceId && activeWorkspace) {
      setActiveWorkspaceId(activeWorkspace.id);
    }
  }, [activeWorkspace, activeWorkspaceId, setActiveWorkspaceId]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title={activeWorkspace.name}
          subtitle="Your Pro sourcing workspace"
          onBack={onBack}
        />

        <Card padding="md" className="gap-4">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft">
              <AppIcon name="storefront" size={21} color={theme.colors.primary} weight="bold" />
            </View>
            <View className="flex-1 gap-1">
              <AppText variant="title">{activeWorkspace.name}</AppText>
              <AppText variant="bodySmall">{activeWorkspace.businessType}</AppText>
            </View>
          </View>

          <WorkspaceDetail
            label="Sourcing categories"
            value={activeWorkspace.primarySourcingCategories.join(", ")}
          />
          <WorkspaceDetail label="Default currency" value={activeWorkspace.defaultCurrency} />
          <WorkspaceDetail label="Country or region" value={activeWorkspace.countryRegion} />
        </Card>

        {workspaces.length > 1 && (
          <Card padding="md" className="gap-2">
            <AppText variant="label">Your workspaces</AppText>
            {workspaces.map((workspace) => (
              <Pressable
                key={workspace.id}
                accessibilityRole="button"
                accessibilityState={{ selected: workspace.id === activeWorkspace.id }}
                className="flex-row items-center gap-3 rounded-2xl py-3"
                onPress={() => setActiveWorkspaceId(workspace.id)}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary-soft">
                  <AppIcon
                    name={workspace.id === activeWorkspace.id ? "check" : "storefront"}
                    size={17}
                    color={theme.colors.primary}
                  />
                </View>
                <View className="flex-1">
                  <AppText className="font-semibold">{workspace.name}</AppText>
                  <AppText variant="caption">{workspace.role}</AppText>
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        <WorkspaceTeamCard workspaceId={activeWorkspace.id} role={activeWorkspace.role} />

        <Card padding="md" className="gap-2 bg-primary-soft">
          <AppText variant="title">Business sourcing starts here</AppText>
          <AppText variant="bodySmall">
            Keep each restock and inventory job together with products, target quantities, prices,
            sources, and required dates.
          </AppText>
          <Button size="sm" onPress={onOpenSourcingLists}>
            Open sourcing lists
          </Button>
          <Button size="sm" variant="outline" onPress={onOpenSuppliers}>
            Manage suppliers
          </Button>
        </Card>

        <Button variant="outline" onPress={onSwitchToPersonal}>
          Switch to Personal DealDrop
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function WorkspaceTeamCard({ workspaceId, role }: { workspaceId: string; role: ApiWorkspaceRole }) {
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState<Exclude<ApiWorkspaceRole, "owner">>("buyer");
  const { colors } = useTheme();
  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
  });
  const queryClient = useQueryClient();
  const inviteMutation = useMutation({
    mutationFn: () => inviteWorkspaceMember(workspaceId, email.trim(), memberRole),
    onSuccess: () => {
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
    },
  });
  const members = membersQuery.data ?? [];

  return (
    <Card padding="md" className="gap-3">
      <View className="gap-1">
        <AppText variant="label">Team sourcing</AppText>
        <AppText variant="bodySmall">
          Invite an existing DealDrop account as a buyer or viewer. Owners and buyers can update
          sourcing work; viewers can follow progress.
        </AppText>
      </View>

      {members.map((member: ApiWorkspaceMember) => (
        <View
          key={member.userId}
          className="flex-row items-center justify-between border-t border-border pt-3"
        >
          <View className="flex-1 gap-1">
            <AppText className="font-semibold">
              {member.fullName ?? member.email ?? "Team member"}
            </AppText>
            {member.fullName && member.email && <AppText variant="caption">{member.email}</AppText>}
          </View>
          <AppText variant="caption">{member.role}</AppText>
        </View>
      ))}

      {role === "owner" && (
        <View className="gap-3 border-t border-border pt-3">
          <Input
            label="DealDrop account email"
            placeholder="buyer@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View className="flex-row gap-2">
            {(["buyer", "viewer"] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: memberRole === option }}
                style={[
                  workspaceRoleStyles.option,
                  {
                    backgroundColor: memberRole === option ? colors.primary : colors.surfaceMuted,
                  },
                ]}
                onPress={() => setMemberRole(option)}
              >
                <Text
                  style={[
                    workspaceRoleStyles.optionText,
                    { color: memberRole === option ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            size="sm"
            loading={inviteMutation.isPending}
            disabled={!email.trim()}
            onPress={() => inviteMutation.mutate()}
          >
            Add team member
          </Button>
          {inviteMutation.isError && (
            <AppText variant="error">
              That email must belong to an existing DealDrop account.
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}

const workspaceRoleStyles = StyleSheet.create({
  option: {
    minHeight: 40,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

function WorkspaceDetail({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1 border-t border-border pt-3">
      <AppText variant="caption">{label}</AppText>
      <AppText className="font-semibold">{value}</AppText>
    </View>
  );
}
