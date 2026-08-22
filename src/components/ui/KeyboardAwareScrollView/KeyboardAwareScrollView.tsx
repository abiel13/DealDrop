import { useEffect, useRef } from "react";
import { KeyboardAwareFocusContext } from "./keyboard-aware.context";
import {
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  UIManager,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
} from "react-native";

type LayoutHandler = NonNullable<ScrollViewProps["onLayout"]>;

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  behavior?: KeyboardAvoidingViewProps["behavior"];
  className?: string;
  contentContainerClassName?: string;
  keyboardVerticalOffset?: number;
}

export function useKeyboardAwareFocus(
  getScrollableNode: () => number | null,
  scrollTo: (offset: number) => void,
) {
  const viewportHeight = useRef(0);
  const focusedTarget = useRef<number | null>(null);
  const focusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimeout.current) {
        clearTimeout(focusTimeout.current);
      }
    };
  }, []);

  function scheduleScroll() {
    if (focusTimeout.current) {
      clearTimeout(focusTimeout.current);
    }

    focusTimeout.current = setTimeout(measureFocusedInput, 120);
  }

  function measureFocusedInput() {
    const target = focusedTarget.current;
    const scrollableNode = getScrollableNode();
    const height = viewportHeight.current;
    if (!target || !scrollableNode || !height) return;

    UIManager.measureLayout(
      target,
      scrollableNode,
      () => undefined,
      (_left, top, _width, inputHeight) => {
        const margin = 32;
        const visibleBottom = height - margin;
        if (top < margin) {
          scrollTo(Math.max(0, top - margin));
        } else if (top + inputHeight > visibleBottom) {
          scrollTo(Math.max(0, top - height + inputHeight + margin));
        }
      },
    );
  }

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

  const onLayout: LayoutHandler = (event) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    if (focusedTarget.current) {
      scheduleScroll();
    }
  };

  return { onBlur, onFocus, onLayout };
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
  const focusHandlers = useKeyboardAwareFocus(
    () => findNodeHandle(scrollViewRef.current),
    (offset) => scrollViewRef.current?.scrollTo({ y: offset, animated: true }),
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
          onLayout={(event) => {
            focusHandlers.onLayout(event);
            onLayout?.(event);
          }}
        />
      </KeyboardAvoidingView>
    </KeyboardAwareFocusContext.Provider>
  );
}
