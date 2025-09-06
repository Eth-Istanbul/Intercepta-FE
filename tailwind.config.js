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
          black: '#0a0a0a',
          dark: '#141414',
          darker: '#1a1a1a',
          gray: '#2a2a2a',
          border: '#333333',
          accent: '#4a9eff',
          success: '#22c55e',
          danger: '#ef4444',
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
