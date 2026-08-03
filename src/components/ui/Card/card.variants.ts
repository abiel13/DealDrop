import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "rounded-2xl w-full h-fit rounded-lg bg-white shadow-sm p-4",
  {
    variants: {
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },

    defaultVariants: {
      padding: "md",
    },
  }
);