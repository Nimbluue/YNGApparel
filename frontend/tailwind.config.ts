import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0px',
      DEFAULT: '0px',
      sm: '0px',
      md: '0px',
      lg: '0px',
      full: '0px',
    },
    extend: {
      colors: {
        ink: '#09090b',
        bone: '#fafafa',
        surface: '#ffffff',
        muted: '#71717a',
        line: '#e4e4e7',
        'line-strong': '#18181b',
        'status-ok': '#15803d',
        'status-warn': '#b45309',
        'status-err': '#b91c1c',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      minHeight: {
        touch: '44px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
