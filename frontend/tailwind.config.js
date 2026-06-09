/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        gold: '#C9A84C',
        'gold-bright': '#F0C060',
      },
      fontFamily: {
        serif: ['Cinzel', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  // The bespoke design lives in src/styles/design.css; Tailwind is for new utilities.
  corePlugins: { preflight: false },
  plugins: [],
}
