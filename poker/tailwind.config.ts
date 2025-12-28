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
        // Map primary to ember for backward compatibility
        primary: "var(--ember-1)",
        "primary-light": "var(--ember-0)",
        "primary-dark": "var(--ember-2)",
        secondary: "var(--text-0)",
        "secondary-dark": "var(--bg-0)",
        // Design system colors
        ember: {
          0: "var(--ember-0)",
          1: "var(--ember-1)",
          2: "var(--ember-2)",
          3: "var(--ember-3)",
        },
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
        },
        text: {
          0: "var(--text-0)",
          1: "var(--text-1)",
          2: "var(--text-2)",
        },
        stroke: {
          0: "var(--stroke-0)",
          ember: "var(--stroke-ember)",
        },
        background: 'var(--bg-0)',
        foreground: 'var(--text-0)'
      },
      borderRadius: {
        lg: 'var(--radius-card)',
        md: 'var(--radius-input)',
        sm: 'var(--radius-input)',
        badge: 'var(--radius-badge)',
      },
      spacing: {
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '6': 'var(--space-6)',
      },
      transitionDuration: {
        'fast': 'var(--transition-fast)',
        'base': 'var(--transition-base)',
        'slow': 'var(--transition-slow)',
      },
      transitionTimingFunction: {
        'out': 'var(--ease-out)',
      },
    }
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
