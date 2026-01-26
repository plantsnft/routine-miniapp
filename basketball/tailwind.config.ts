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
        background: 'var(--bg-0)',
        foreground: 'var(--text-0)'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius)',
        sm: 'var(--radius)',
      },
    }
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
