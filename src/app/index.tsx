import { Redirect } from "expo-router";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes } from "@/features/auth/routes";

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  return <Redirect href={user ? authRoutes.home : authRoutes.login} />;
}
