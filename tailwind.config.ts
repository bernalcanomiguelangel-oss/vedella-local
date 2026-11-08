import type { Config } from "tailwindcss";

/**
 * Warm pasture / beef palette.
 * - pasture: warm greens of Catalan grazing land
 * - beef: deep reds/maroons of aged beef
 * - cream: warm off-white backgrounds
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pasture: {
          50: "#f4f7ee",
          100: "#e6eed7",
          200: "#cedcb2",
          300: "#aec384",
          400: "#8fa95d",
          500: "#718c41",
          600: "#566e31",
          700: "#435529",
          800: "#384525",
          900: "#303b22",
        },
        beef: {
          50: "#fbf3f2",
          100: "#f7e3e1",
          200: "#f0cbc8",
          300: "#e4a7a2",
          400: "#d47a73",
          500: "#c0524a",
          600: "#a93c35",
          700: "#8d2f2a",
          800: "#762a26",
          900: "#642825",
        },
        cream: {
          50: "#fdfbf6",
          100: "#faf5e9",
          200: "#f3e9cf",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
