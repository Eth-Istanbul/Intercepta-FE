/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup.tsx",
    "./contents/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./*.html"
  ],
  theme: {
    extend: {
      colors: {
        praetor: {
          purple: '#764ba2',
          indigo: '#667eea',
          dark: '#1a1b3a',
          light: '#f0f3ff'
        }
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'spin-slow': 'spin 2s linear infinite'
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        }
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
}
