import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cw: {
          bg: '#0A0A0C',
          card: '#121216',
          elevated: '#1B1B22',
          border: '#24242D',
          neon: '#00FF66',
          'neon-dim': 'rgba(0, 255, 102, 0.12)',
          danger: '#FF3366',
          'danger-dim': 'rgba(255, 51, 102, 0.15)',
          gold: '#FFB800',
          'gold-dim': 'rgba(255, 184, 0, 0.15)',
          muted: '#9E9EA7',
          dim: '#60606B',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;