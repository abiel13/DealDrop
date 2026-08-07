import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "h-fit w-full rounded-3xl border border-border bg-surface shadow-card",
  {
    variants: {
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-5",
        lg: "p-6",
      },
    },

    defaultVariants: {
      padding: "md",
    },
  },
);
