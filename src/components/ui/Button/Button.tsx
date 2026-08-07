import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

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
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const [isPressed, setIsPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: withTiming(isPressed && !isDisabled ? 0.98 : 1, {
            duration: isPressed ? 120 : 160,
          }),
        },
      ],
    }),
    [isDisabled, isPressed],
  );

  function handlePressIn(event: Parameters<NonNullable<ButtonProps["onPressIn"]>>[0]) {
    setIsPressed(true);
    onPressIn?.(event);
  }

  function handlePressOut(event: Parameters<NonNullable<ButtonProps["onPressOut"]>>[0]) {
    setIsPressed(false);
    onPressOut?.(event);
  }

  return (
    <Animated.View style={animatedStyle}>
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
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...props}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <View className="flex-row items-center justify-center gap-2">
            {leftIcon}

            <Text className={buttonTextVariants({ variant })}>{children}</Text>

            {rightIcon}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
