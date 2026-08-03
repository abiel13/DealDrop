import { View } from "react-native";

import { cn } from "@/lib/utils";

import { CardProps } from "./card.types";
import { cardVariants } from "./card.variants";

export function Card({
  children,
  padding,
  className,
  ...props
}: CardProps) {
  return (
    <View
      className={cn(
        cardVariants({
          padding,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}