import type { SymbolWeight } from "expo-symbols";

export type AppIconName =
  | "arrow-forward"
  | "arrow-left"
  | "check"
  | "close"
  | "credit-card"
  | "delete"
  | "filter"
  | "heart"
  | "home"
  | "info"
  | "lock"
  | "mail"
  | "notifications"
  | "person"
  | "place"
  | "refresh"
  | "search"
  | "settings"
  | "sort"
  | "star"
  | "storefront"
  | "tune"
  | "warning";

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
}
