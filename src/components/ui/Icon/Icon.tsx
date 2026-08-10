import { SymbolView } from "expo-symbols";
import type { AndroidSymbol, SFSymbol } from "expo-symbols";

import { useTheme } from "@/providers/ThemeProvider";

import type { AppIconName, AppIconProps } from "./icon.types";

const symbols: Record<AppIconName, { ios: SFSymbol; android: AndroidSymbol }> = {
  "arrow-forward": { ios: "arrow.right", android: "arrow_forward" },
  "arrow-left": { ios: "arrow.left", android: "arrow_back" },
  check: { ios: "checkmark", android: "check" },
  close: { ios: "xmark", android: "close" },
  "credit-card": { ios: "creditcard", android: "credit_card" },
  delete: { ios: "trash", android: "delete" },
  filter: { ios: "line.3.horizontal.decrease", android: "filter_list" },
  heart: { ios: "heart", android: "favorite" },
  home: { ios: "house.fill", android: "home" },
  image: { ios: "photo", android: "image" },
  info: { ios: "info.circle", android: "info" },
  lock: { ios: "lock.fill", android: "lock" },
  mail: { ios: "envelope.fill", android: "mail" },
  notifications: { ios: "bell.fill", android: "notifications" },
  person: { ios: "person.fill", android: "person" },
  place: { ios: "mappin.and.ellipse", android: "place" },
  refresh: { ios: "arrow.clockwise", android: "refresh" },
  search: { ios: "magnifyingglass", android: "search" },
  settings: { ios: "gearshape.fill", android: "settings" },
  sort: { ios: "arrow.up.arrow.down", android: "sort" },
  star: { ios: "star.fill", android: "star" },
  storefront: { ios: "storefront.fill", android: "storefront" },
  tune: { ios: "slider.horizontal.3", android: "tune" },
  warning: { ios: "exclamationmark.triangle.fill", android: "warning" },
};

export function AppIcon({ name, size = 20, color, weight = "medium" }: AppIconProps) {
  const theme = useTheme();

  return (
    <SymbolView
      name={symbols[name]}
      size={size}
      tintColor={color ?? theme.colors.textSecondary}
      weight={weight}
    />
  );
}
