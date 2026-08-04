import { View } from "react-native";

import { cn } from "@/lib/utils";

import { DividerProps } from "./divider.types";

export function Divider({ className, vertical = false }: DividerProps) {
  return (
    <View
      className={cn(vertical ? "w-px self-stretch bg-border" : "h-px w-full bg-border", className)}
    />
  );
}
