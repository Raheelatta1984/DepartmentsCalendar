/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#070b14',
          900: '#0b1220',
          850: '#0f1829',
          800: '#131f33',
          700: '#1c2c45',
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          200: '#bcd0ff',
          300: '#8eb0ff',
          400: '#5c87fb',
          500: '#3a63f0',
          600: '#2947d6',
          700: '#2339ab',
          800: '#223387',
          900: '#21306b',
        },
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.65)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .25s ease-out both',
      },
    },
  },
  plugins: [],
};
