/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // tailwind.config.js

  theme: {
    extend: {
      colors: {
        primary: "#7C3AED",
        "primary-light": "#A78BFA",
        "primary-dark": "#5B21B6",
        "primary-soft": "#EDE9FE",

        background: "#F8F7FC",
        "background-muted": "#F1EFF8",
        surface: "#FFFFFF",
        "surface-muted": "#FBFAFE",

        card: "#FFFFFF",

        text: "#181426",
        "text-secondary": "#6B6478",
        "text-tertiary": "#9891A6",

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
        card: "0 8px 24px rgba(54, 36, 91, 0.07)",
        elevated: "0 16px 40px rgba(54, 36, 91, 0.12)",
      },
    },
  },
  plugins: [],
};
