import { cva } from "class-variance-authority";

export const textVariants = cva("", {
  variants: {
    variant: {
      display: "text-4xl font-bold text-text",
      heading: "text-3xl font-bold text-text",
      title: "text-2xl font-semibold text-text",
      subtitle: "text-lg font-medium text-text-secondary",
      body: "text-base text-text",
      bodySmall: "text-sm text-text-secondary",
      caption: "text-xs text-text-secondary",
      label: "text-sm font-medium text-text",
      error: "text-sm text-error",
    },
  },

  defaultVariants: {
    variant: "body",
  },
});
