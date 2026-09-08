/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#16233F',
        navyDeep: '#0F1A2E',
        teal: '#0F6E6A',
        tealSoft: '#E4F1F0',
        amber: '#B5750A',
        amberSoft: '#FCEFD9',
        rose: '#B23A48',
        roseSoft: '#F8E6E8',
        canvas: '#F6F7F6',
        panel: '#FFFFFF',
        ink: '#1B2430',
        slate: '#5B6672',
        slateSoft: '#8B95A1',
        line: '#E2E6E4',
        lineSoft: '#EDEFED',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
