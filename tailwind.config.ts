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
          300: "#ecdcb6",
        },
        // Warm admin palette (docs/admin-information-architecture.md §1):
        // dark-brown primary, golden secondary, green for operational states.
        bark: {
          50: "#f7f3ef",
          100: "#eadfd4",
          200: "#d6c0ac",
          300: "#bb9b7e",
          400: "#9c7858",
          500: "#7e5c3f",
          600: "#654731",
          700: "#4f3828",
          800: "#3d2c21",
          900: "#2f221a",
        },
        gold: {
          50: "#fdf8ec",
          100: "#faeecb",
          200: "#f3da92",
          300: "#ecc45a",
          400: "#e3ad30",
          500: "#c9901d",
          600: "#a66f16",
          700: "#845316",
          800: "#6d4318",
          900: "#5c3817",
        },
        olive: {
          50: "#f3f6ec",
          100: "#e2ebcf",
          200: "#c6d7a3",
          300: "#a5bd72",
          400: "#86a24c",
          500: "#67833a",
          600: "#4f682d",
          700: "#3e5126",
          800: "#344123",
          900: "#2d381f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "Georgia",
          "ui-serif",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
