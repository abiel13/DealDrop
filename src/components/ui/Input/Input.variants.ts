import { cva } from "class-variance-authority";

export const inputVariants = cva("h-12 rounded-xl border px-4 flex-row items-center", {
  variants: {
    state: {
      default: "border-border bg-surface",
      error: "border-error",
      disabled: "opacity-50",
    },
  },

  defaultVariants: {
    state: "default",
  },
});
