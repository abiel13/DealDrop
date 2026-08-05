import { cva } from "class-variance-authority";

export const buttonTextVariants = cva("font-semibold text-base", {
  variants: {
    variant: {
      primary: "text-white",
      secondary: "text-white",
      outline: "text-primary",
      ghost: "text-primary",
      danger: "text-white",
    },
  },

  defaultVariants: {
    variant: "primary",
  },
});
