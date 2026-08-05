import { useState } from "react";
import { TextInput, View } from "react-native";

import { AppText } from "@/components/ui/Text";
import { appColors } from "@/styles/colors";
import { cn } from "@/lib/utils";

import { InputProps } from "./Input.types";
import { inputVariants } from "./Input.variants";

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  className,
  editable = true,
  onBlur,
  onFocus,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className="gap-2">
      {label && <AppText variant="label">{label}</AppText>}

      <View
        className={cn(
          inputVariants({
            state: !editable ? "disabled" : error ? "error" : "default",
            focused: isFocused && editable && !error,
          }),
          className,
        )}
      >
        {leftIcon}

        <TextInput
          className="flex-1 text-text"
          editable={editable}
          placeholderTextColor={appColors.textTertiary}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          {...props}
        />

        {rightIcon}
      </View>

      {error && <AppText variant="error">{error}</AppText>}
    </View>
  );
}
