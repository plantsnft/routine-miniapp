import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#c1b400",
        "primary-light": "#d4c700",
        "primary-dark": "#a89a00",
        secondary: "#ffffff",
        "secondary-dark": "#000000",
        background: 'var(--background)',
        foreground: 'var(--foreground)'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
    }
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
