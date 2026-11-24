import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        bone: '#ffffff',
        surface: '#f5f5f5',
        muted: '#666666',
        line: '#e5e5e5',
        'line-strong': '#d4d4d4',
        accent: '#111111',
        'status-ok': '#15803d',
        'status-warn': '#b45309',
        'status-err': '#b91c1c',
      },
      fontFamily: {
        display: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        editorial: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
    },
  },
  plugins: [],
};

export default config;
