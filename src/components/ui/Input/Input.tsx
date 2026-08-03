import { TextInput, View } from "react-native";

import { cn } from "@/lib/utils";
import { AppText } from "@/components/ui/Text";

import { InputProps } from "./Input.types";
import { inputVariants } from "./Input.variants";

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  className,
  editable = true,
  ...props
}: InputProps) {
  return (
    <View className="gap-2">
      {label && (
        <AppText variant="label">
          {label}
        </AppText>
      )}

      <View
        className={cn(
          inputVariants({
            state: !editable
              ? "disabled"
              : error
                ? "error"
                : "default",
          }),
          className,
        )}
      >
        {leftIcon}

        <TextInput
          className="flex-1 text-text"
          editable={editable}
          placeholderTextColor="#9CA3AF"
          {...props}
        />

        {rightIcon}
      </View>

      {error && (
        <AppText variant="error">
          {error}
        </AppText>
      )}
    </View>
  );
}