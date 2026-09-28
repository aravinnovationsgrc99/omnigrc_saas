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
        cpDark: {
          950: '#0B0F19',
          900: '#111827',
          850: '#151E32',
          800: '#1F2937',
          700: '#374151',
          600: '#4B5563',
        },
        aravBlue: {
          DEFAULT: '#1D4ED8',
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        aravTeal: {
          DEFAULT: '#0F6E6A',
          400: '#2F968F',
          500: '#0F6E6A',
          600: '#0C5A56',
        },
        statusActive: '#10B981',
        statusSuspended: '#F59E0B',
        statusDisabled: '#6B7280',
        statusRevoked: '#EF4444',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
