import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        felt: {
          50: '#e7f5ec',
          400: '#1f7a52',
          500: '#0d7040',
          600: '#0f5c3a',
          700: '#0c4a2f',
          800: '#0a3d27',
          900: '#062a1a',
          950: '#041d12',
        },
        gold: {
          100: '#fdf5d8',
          200: '#f6e3ab',
          300: '#f0d27a',
          400: '#e8bd4e',
          500: '#d4a835',
          600: '#b3872a',
          700: '#8a6620',
          900: '#4a3512',
        },
        neon: {
          green: '#39ff7e',
          gold: '#ffd86b',
          magenta: '#f472b6',
          cyan: '#22d3ee',
          violet: '#a78bfa',
        },
        panel: {
          DEFAULT: '#0f1214',
          raised: '#151a1e',
          border: '#253038',
        },
      },
      boxShadow: {
        felt: 'inset 0 0 90px rgba(0, 0, 0, .55), inset 0 0 24px rgba(0, 0, 0, .4), 0 28px 60px rgba(0, 0, 0, .5)',
        gold: '0 0 0 1px rgba(232, 189, 78, .5), 0 0 18px rgba(232, 189, 78, .35)',
        neon: '0 0 0 1px rgba(34, 211, 238, .45), 0 0 24px rgba(34, 211, 238, .25)',
        neonGold: '0 0 0 1px rgba(255, 216, 107, .45), 0 0 22px rgba(255, 216, 107, .22)',
        insetFelt: 'inset 0 0 60px rgba(0, 0, 0, .45), inset 0 -20px 40px rgba(0, 50, 20, .3)',
      },
    },
  },
  plugins: [],
} satisfies Config
