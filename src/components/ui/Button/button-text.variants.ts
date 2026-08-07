import { cva } from "class-variance-authority";

export const buttonTextVariants = cva("text-[15px] font-semibold", {
  variants: {
    variant: {
      primary: "text-white",
      secondary: "text-primary-dark",
      outline: "text-primary",
      ghost: "text-primary",
      danger: "text-white",
    },
  },

  defaultVariants: {
    variant: "primary",
  },
});
