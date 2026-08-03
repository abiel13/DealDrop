import type { VariantProps } from "class-variance-authority";
import type { TextProps as RNTextProps } from "react-native";

import { textVariants } from "./text.variants";

export interface TextProps extends RNTextProps, VariantProps<typeof textVariants> {
  className?: string;
}
