import { cva } from "class-variance-authority";

export const inputVariants = cva(
  "min-h-14 rounded-2xl border bg-surface px-4 flex-row items-center",
  {
    variants: {
      state: {
        default: "border-border",
        error: "border-error bg-red-50",
        disabled: "opacity-50",
      },
      focused: {
        true: "border-primary shadow-card",
        false: "",
      },
    },

    defaultVariants: {
      state: "default",
    },
  },
);
