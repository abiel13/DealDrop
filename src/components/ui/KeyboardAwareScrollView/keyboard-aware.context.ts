import { createContext } from "react";

export interface KeyboardAwareFocusHandler {
  onBlur: () => void;
  onFocus: (target: number) => void;
}

export const KeyboardAwareFocusContext = createContext<KeyboardAwareFocusHandler | null>(null);
