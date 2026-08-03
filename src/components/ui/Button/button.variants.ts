import { cva } from "class-variance-authority";

export const buttonVariants = cva("flex-row items-center justify-center rounded-xl gap-2", {
  variants: {
    variant: {
      primary: "bg-primary",
      secondary: "bg-primary-light",
      outline: "border border-primary bg-transparent",
      ghost: "bg-transparent",
      danger: "bg-error",
    },

    size: {
      sm: "h-10 px-4",
      md: "h-12 px-5",
      lg: "h-14 px-6",
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
});
