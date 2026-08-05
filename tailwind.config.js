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
        "primary-light": "#A78BFA",
        "primary-dark": "#7C3AED",

        background: "#FAFAFC",
        surface: "#FFFFFF",

        card: "#FFFFFF",

        text: "#111827",
        "text-secondary": "#6B7280",

        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
    },
  },
  plugins: [],
};
