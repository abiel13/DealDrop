import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";

import { inputVariants } from "./Input.variants";

export interface InputProps extends TextInputProps, VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  inputClassName?: string;
}
