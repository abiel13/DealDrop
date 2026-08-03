import { Text as RNText } from "react-native";

import { cn } from "@/lib/utils";

import { TextProps } from "./text.type";
import { textVariants } from "./text.variants";

export function AppText({ variant, className, children, ...props }: TextProps) {
  return (
    <RNText className={cn(textVariants({ variant }), className)} {...props}>
      {children}
    </RNText>
  );
}
