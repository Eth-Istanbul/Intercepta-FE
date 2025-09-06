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
          black: '#ffffff',
          dark: '#f7fafc',
          darker: '#f1f5f9',
          gray: '#edf2f7',
          border: '#e2e8f0',
          accent: '#627EEA',
          success: '#16a34a',
          danger: '#dc2626',
          warning: '#f59e0b'
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
