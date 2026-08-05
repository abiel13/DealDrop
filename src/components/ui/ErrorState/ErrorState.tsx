import { View } from "react-native";

import { AppIcon } from "@/components/ui/Icon";
import { appColors } from "@/styles/colors";

import { AppText } from "../Text";

import { ErrorStateProps } from "./errorstate.types";

export function ErrorState({ title, description }: ErrorStateProps) {
  return (
    <View className="items-center justify-center gap-3 rounded-3xl bg-red-50 px-6 py-12">
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
        <AppIcon name="warning" size={24} color={appColors.error} />
      </View>
      <AppText variant="title" className="text-center text-error">
        {title}
      </AppText>

      <AppText variant="bodySmall" className="text-center">
        {description}
      </AppText>
    </View>
  );
}
