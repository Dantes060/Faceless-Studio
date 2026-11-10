import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090d",
          900: "#0d0f14",
          850: "#12141b",
          800: "#171a22",
          700: "#232733",
          600: "#343a4a",
          500: "#4b5366",
          400: "#6b7488",
          300: "#98a1b3",
          200: "#c3cad6",
          100: "#e6eaf1",
        },
        lime: {
          400: "#c9f24d",
          500: "#b4e02e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
