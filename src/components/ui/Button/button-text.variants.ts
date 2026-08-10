import { cva } from "class-variance-authority";

export const buttonTextVariants = cva("text-[15px] font-semibold", {
  variants: {
    variant: {
      primary: "text-white",
      secondary: "text-primary-contrast",
      outline: "text-primary-contrast",
      ghost: "text-primary-contrast",
      danger: "text-white",
    },
  },

  defaultVariants: {
    variant: "primary",
  },
});
