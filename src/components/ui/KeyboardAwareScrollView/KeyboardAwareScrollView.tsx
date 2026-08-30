import { useCallback, useEffect, useRef } from "react";
import { KeyboardAwareFocusContext } from "./keyboard-aware.context";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
} from "react-native";

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  behavior?: KeyboardAvoidingViewProps["behavior"];
  className?: string;
  contentContainerClassName?: string;
  keyboardVerticalOffset?: number;
}

export function useKeyboardAwareFocus(scrollToFocusedInput: (target: number) => void) {
  const focusedTarget = useRef<number | null>(null);
  const focusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleScroll = useCallback(() => {
    if (focusTimeout.current) {
      clearTimeout(focusTimeout.current);
    }

    focusTimeout.current = setTimeout(() => {
      const target = focusedTarget.current;
      if (target) {
        scrollToFocusedInput(target);
      }
    }, 160);
  }, [scrollToFocusedInput]);

  useEffect(() => {
    const keyboardEvents =
      Platform.OS === "ios"
        ? (["keyboardDidShow", "keyboardDidChangeFrame"] as const)
        : (["keyboardDidShow"] as const);
    const subscriptions = keyboardEvents.map((eventName) =>
      Keyboard.addListener(eventName, scheduleScroll),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      if (focusTimeout.current) {
        clearTimeout(focusTimeout.current);
      }
    };
  }, [scheduleScroll]);

  const onFocus = (target: number) => {
    if (!target) return;
    focusedTarget.current = target;
    scheduleScroll();
  };

  const onBlur = () => {
    focusedTarget.current = null;
    if (focusTimeout.current) {
      clearTimeout(focusTimeout.current);
    }
  };

  return { onBlur, onFocus };
}

export function KeyboardAwareScrollView({
  behavior = Platform.OS === "ios" ? "padding" : "height",
  className,
  contentContainerClassName,
  keyboardVerticalOffset = 0,
  onLayout,
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const focusHandlers = useKeyboardAwareFocus((target) =>
    scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(target, 32, true),
  );

  return (
    <KeyboardAwareFocusContext.Provider value={focusHandlers}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={behavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          {...scrollViewProps}
          ref={scrollViewRef}
          className={className}
          contentContainerClassName={contentContainerClassName}
          onLayout={onLayout}
        />
      </KeyboardAvoidingView>
    </KeyboardAwareFocusContext.Provider>
  );
}
