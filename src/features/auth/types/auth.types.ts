import type { Session, User } from "@supabase/supabase-js";
import type { ReactNode } from "react";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

export interface AuthProviderProps {
  children: ReactNode;
}
