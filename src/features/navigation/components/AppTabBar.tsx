import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/ui/Icon";
import type { AppIconName } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { appColors } from "@/styles/colors";

const tabPresentation: Record<string, { label: string; icon: AppIconName }> = {
  index: { label: "Feed", icon: "home" },
  watchlists: { label: "Watchlists", icon: "star" },
  notifications: { label: "Alerts", icon: "notifications" },
  profile: { label: "Profile", icon: "person" },
};

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-background px-5 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      <View className="flex-row rounded-[28px] bg-surface p-1 shadow-elevated">
        {state.routes.map((route, index) => {
          const presentation = tabPresentation[route.name];
          if (!presentation) {
            return null;
          }

          const isFocused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              className={`min-h-14 flex-1 items-center justify-center rounded-2xl ${isFocused ? "bg-primary-soft" : ""}`}
              onLongPress={onLongPress}
              onPress={onPress}
            >
              <AppIcon
                name={presentation.icon}
                size={21}
                color={isFocused ? appColors.primary : appColors.textTertiary}
                weight={isFocused ? "bold" : "medium"}
              />
              <AppText
                variant="caption"
                className={
                  isFocused ? "mt-1 font-semibold text-primary" : "mt-1 text-text-tertiary"
                }
              >
                {presentation.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
