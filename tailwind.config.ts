import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Зелёная садовая палитра в духе LETTO
        brand: {
          50: "#f1f8ee",
          100: "#dcedd3",
          200: "#baddae",
          300: "#92c878",
          400: "#6cae4e",
          500: "#4f9230",
          600: "#3c7424",
          700: "#305b1f",
          800: "#29491e",
          900: "#243e1c",
        },
        accent: {
          400: "#ff8a3d",
          500: "#f5731f",
          600: "#dd5e13",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
