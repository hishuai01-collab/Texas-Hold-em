import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      boxShadow: {
        felt: 'inset 0 0 80px rgba(0, 0, 0, .45), 0 28px 60px rgba(0, 0, 0, .35)',
      },
    },
  },
  plugins: [],
} satisfies Config
