import { useContext, useState } from "react";
import { TextInput, View } from "react-native";

import { AppText } from "@/components/ui/Text";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";
import { KeyboardAwareFocusContext } from "../KeyboardAwareScrollView/keyboard-aware.context";

import type { InputProps } from "./Input.types";
import { inputVariants } from "./Input.variants";

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  className,
  inputClassName,
  editable = true,
  onBlur,
  onFocus,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();
  const keyboardAwareFocus = useContext(KeyboardAwareFocusContext);

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
          className={cn("flex-1 text-text", inputClassName)}
          editable={editable}
          placeholderTextColor={theme.colors.textTertiary}
          onBlur={(event) => {
            setIsFocused(false);
            keyboardAwareFocus?.onBlur();
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            keyboardAwareFocus?.onFocus(event.nativeEvent.target);
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
