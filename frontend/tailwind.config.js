/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          lighter: 'rgb(var(--brand-lighter) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        warn: {
          DEFAULT: 'rgb(var(--warn) / <alpha-value>)',
          bg: 'rgb(var(--warn-bg) / <alpha-value>)',
          border: 'rgb(var(--warn-border) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
          border: 'rgb(var(--danger-border) / <alpha-value>)',
        },
        ok: {
          DEFAULT: 'rgb(var(--ok) / <alpha-value>)',
          bg: 'rgb(var(--ok-bg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Segoe UI', 'Tahoma', 'system-ui', '-apple-system', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 4px 16px -4px rgb(0 0 0 / 0.08)',
        'card-hover': '0 2px 4px 0 rgb(0 0 0 / 0.06), 0 12px 28px -8px rgb(0 0 0 / 0.14)',
        button: '0 2px 8px -2px rgb(46 125 50 / 0.35)',
      },
      borderRadius: {
        card: 'var(--radius-lg)',
        bubble: 'var(--radius-bubble)',
        pill: 'var(--radius-pill)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        typingDot: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        floatY: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        floatX: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(12px)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.15', transform: 'scale(0.8)' },
          '50%': { opacity: '0.9', transform: 'scale(1.15)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 50%' },
          '100%': { backgroundPosition: '-200% 50%' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--brand-accent) / 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgb(var(--brand-accent) / 0)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out both',
        typingDot: 'typingDot 1.2s ease-in-out infinite',
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
        floatY: 'floatY 6s ease-in-out infinite',
        floatYSlow: 'floatY 9s ease-in-out infinite',
        floatX: 'floatX 8s ease-in-out infinite',
        twinkle: 'twinkle 3.5s ease-in-out infinite',
        spinSlow: 'spinSlow 28s linear infinite',
        spinSlowReverse: 'spinSlow 40s linear infinite reverse',
        shimmer: 'shimmer 6s linear infinite',
        breathe: 'breathe 5s ease-in-out infinite',
        glowPulse: 'glowPulse 2.4s ease-out infinite',
        gradientShift: 'gradientShift 8s ease infinite',
        riseIn: 'riseIn 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};
