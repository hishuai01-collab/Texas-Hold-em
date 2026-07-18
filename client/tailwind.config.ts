import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        felt: {
          50: '#e7f5ec',
          400: '#1f7a52',
          600: '#0f5c3a',
          700: '#0c4a2f',
          800: '#0a3d27',
          900: '#062a1a',
          950: '#041d12',
        },
        gold: {
          200: '#f6e3ab',
          300: '#f0d27a',
          400: '#e8bd4e',
          500: '#d4a835',
          600: '#b3872a',
          700: '#8a6620',
        },
      },
      boxShadow: {
        felt: 'inset 0 0 90px rgba(0, 0, 0, .55), inset 0 0 24px rgba(0, 0, 0, .4), 0 28px 60px rgba(0, 0, 0, .5)',
        gold: '0 0 0 1px rgba(232, 189, 78, .5), 0 0 18px rgba(232, 189, 78, .35)',
      },
    },
  },
  plugins: [],
} satisfies Config
