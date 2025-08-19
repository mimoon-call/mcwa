// tailwind.config.js
import { slate } from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: slate[900],
        secondary: slate[50],
      },
      keyframes: {
        zoomIn: {
          '0%': { transform: 'scale(0.5)', opacity: '0.5' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        zoomDown: {
          '0%': { transform: 'scaleY(0.5)', opacity: '0.3' },
          '100%': { transform: 'scaleY(1)', opacity: '1' },
        },
      },
      animation: {
        zoomIn: 'zoomIn 0.3s ease-out',
        zoomDown: 'zoomDown 0.3s ease-out',
      },
    },
  },
  plugins: [
    plugin(function ({ addVariant }) {
      addVariant('rtl', '[dir="rtl"] &');
    }),
    plugin(function ({ addVariant }) {
      addVariant('ltr', '[dir="ltr"] &');
    }),
    plugin(function ({ addVariant }) {
      addVariant('form-error', '[data-has-error="true"] &');
    }),
    plugin(function ({ addVariant }) {
      addVariant('error', ['&[data-has-error="true"]', '&:has([data-has-error="true"])']);
    }),
  ],
};
