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
      fontSize: {
        sm: ['1rem', { lineHeight: '1.5rem' }],
      },
      colors: {
        ink: '#0b0b0c',
        bone: '#f2efe6',
        surface: '#faf8f1',
        muted: '#615e56',
        line: '#c9c3b8',
        'line-strong': '#282622',
        accent: '#ff4f00',
        'status-ok': '#15803d',
        'status-warn': '#b45309',
        'status-err': '#b91c1c',
      },
      fontFamily: {
        display: ['"Archivo Variable"', 'Arial', 'sans-serif'],
        sans: ['"Archivo Variable"', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        editorial: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      minHeight: {
        touch: '44px',
      },
      boxShadow: {
        none: 'none',
      },
      letterSpacing: {
        tightest: '-0.055em',
      },
    },
  },
  plugins: [],
};

export default config;
