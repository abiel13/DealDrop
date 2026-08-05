import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "min-h-12 flex-row items-center justify-center rounded-2xl px-5",
  {
    variants: {
      variant: {
        primary: "bg-primary shadow-card",
        secondary: "bg-primary-soft",
        outline: "bg-surface-muted",
        ghost: "bg-transparent",
        danger: "bg-error shadow-card",
      },

      size: {
        sm: "min-h-10 px-4",
        md: "min-h-12 px-5",
        lg: "min-h-14 px-6",
      },

      disabled: {
        true: "opacity-50",
        false: "",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
      disabled: false,
    },
  },
);
