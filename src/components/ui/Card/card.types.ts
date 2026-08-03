import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import type { ViewProps } from "react-native";

import { cardVariants } from "./card.variants";

export interface CardProps
  extends ViewProps,
    VariantProps<typeof cardVariants> {
  children: ReactNode;
  className?: string;
}