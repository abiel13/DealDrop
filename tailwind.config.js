/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // tailwind.config.js

  theme: {
    extend: {
      colors: {
        primary: "#8B5CF6",
        "primary-light": "#C4B5FD",
        "primary-dark": "#6D28D9",
        "primary-soft": "#F0EBFF",

        background: "#F5F4F8",
        "background-muted": "#ECEAF1",
        surface: "#FFFFFF",
        "surface-muted": "#FAF9FC",

        card: "#FFFFFF",

        text: "#17151D",
        "text-secondary": "#6F6A78",
        "text-tertiary": "#9B96A5",

        success: "#16A36A",
        warning: "#D97706",
        error: "#DC3D5A",
      },
      borderRadius: {
        sm: "10px",
        md: "14px",
        lg: "20px",
        xl: "24px",
      },
      boxShadow: {
        card: "0 4px 16px rgba(35, 27, 51, 0.06)",
        elevated: "0 10px 28px rgba(35, 27, 51, 0.10)",
      },
    },
  },
  plugins: [],
};
