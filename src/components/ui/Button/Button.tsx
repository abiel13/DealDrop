import { ActivityIndicator, Pressable, Text } from "react-native";

import { cn } from "@/lib/utils";

import { buttonTextVariants } from "./button-text.variants";
import { buttonVariants } from "./button.variants";
import { ButtonProps } from "./Button.types";

export function Button({
  children,
  variant,
  size,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        buttonVariants({
          variant,
          size,
          disabled: isDisabled,
        }),
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <>
          {leftIcon}

          <Text className={buttonTextVariants({ variant })}>{children}</Text>

          {rightIcon}
        </>
      )}
    </Pressable>
  );
}
