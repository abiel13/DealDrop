import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, sourcingListFormRoute, sourcingListRoute } from "@/features/auth/routes";
import { AppHeader } from "@/features/navigation/components";
import { useWorkspaceStore } from "@/features/workspaces/store/workspace.store";

import { getSourcingLists } from "../services/sourcing-list.service";
import type { SourcingList } from "../types/sourcing-list.types";

export function SourcingListsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const query = useQuery({
    queryKey: ["sourcing-lists", workspaceId],
    queryFn: () => getSourcingLists(workspaceId ?? ""),
    enabled: Boolean(user && workspaceId),
  });

  if (!user) return <Redirect href={authRoutes.login} />;
  if (!workspaceId) return <Redirect href={authRoutes.workspace} />;
  if (query.isLoading) return <Loading />;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-8 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title="Sourcing lists"
          subtitle="Keep each restock or buying job together in your Pro workspace."
          onBack={() => router.back()}
          action={
            <Button size="sm" onPress={() => router.push(sourcingListFormRoute())}>
              New list
            </Button>
          }
        />

        {query.isError ? (
          <>
            <ErrorState
              title="Couldn't load sourcing lists"
              description="Please check your connection and try again."
            />
            <Button variant="outline" onPress={() => void query.refetch()}>
              Try again
            </Button>
          </>
        ) : (query.data ?? []).length === 0 ? (
          <Card padding="lg" className="items-center gap-3 bg-primary-soft">
            <AppText variant="title" className="text-center">
              Start a sourcing job
            </AppText>
            <AppText variant="bodySmall" className="text-center">
              Build a list for a restock, store opening, or seasonal inventory plan.
            </AppText>
            <Button onPress={() => router.push(sourcingListFormRoute())}>
              Create sourcing list
            </Button>
          </Card>
        ) : (
          (query.data ?? []).map((list) => (
            <SourcingListCard
              key={list.id}
              list={list}
              onPress={() => router.push(sourcingListRoute(list.id))}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SourcingListCard({ list, onPress }: { list: SourcingList; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card padding="md" className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <AppText variant="title">{list.name}</AppText>
            <AppText variant="caption">
              {list.status} · {list.progress.totalProducts} products
            </AppText>
          </View>
          <AppText className="font-semibold text-primary">{list.progress.percentComplete}%</AppText>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${list.progress.percentComplete}%` }}
          />
        </View>
        <View className="flex-row justify-between">
          <AppText variant="bodySmall">
            {list.progress.sourcedQuantity} of {list.progress.targetQuantity} units sourced
          </AppText>
          <AppText variant="caption">
            {list.progress.completedProducts}/{list.progress.totalProducts} complete
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}
