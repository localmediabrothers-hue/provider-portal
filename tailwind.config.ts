import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F1F2EE",
        surface: "#FFFFFF",
        ink: "#171E19",
        muted: "#59635A",
        line: "#DADFD8",
        accent: "#16564A",
        "accent-soft": "#DDEAE4",
        warn: "#9A6A05",
        "warn-soft": "#F7EDD6",
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "Public Sans", "system-ui", "sans-serif"],
        body: ["Public Sans", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
