import type { Config } from "tailwindcss";

// Цвета заданы через CSS-переменные (RGB) — это позволяет переключать светлую и
// тёмную тему, меняя только переменные в globals.css (класс .dark на <html>).
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: v("--brand-50"),
          100: v("--brand-100"),
          200: v("--brand-200"),
          300: v("--brand-300"),
          400: v("--brand-400"),
          500: v("--brand-500"),
          600: v("--brand-600"),
          700: v("--brand-700"),
          800: v("--brand-800"),
          900: v("--brand-900"),
        },
        accent: {
          400: v("--accent-400"),
          500: v("--accent-500"),
          600: v("--accent-600"),
        },
        // Нейтральные поверхности (карточки, шапка, поля) — белые в светлой теме,
        // тёмные в тёмной.
        surface: v("--surface"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease-out both",
        "fade-in": "fadeIn 0.6s ease-out both",
        "pop-in": "popIn 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
