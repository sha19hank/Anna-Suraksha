import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-syne)', 'serif'],
        body: ['var(--font-dm-sans)', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'],
      },
      colors: {
        leaf:    { DEFAULT: '#1A6B4A', light: '#28A870', dark: '#0F3D2A' },
        saffron: { DEFAULT: '#E8772E', light: '#F5A265', dark: '#B85A18' },
        cream:   { DEFAULT: '#FAF7F0', dark: '#EDE7D9' },
        earth:   { DEFAULT: '#2C1810', light: '#5C3D2E' },
      },
      keyframes: {
        'fade-up':   { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in':   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-in':  { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
        'pulse-dot': { '0%, 100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.4)', opacity: '0.7' } },
        'shimmer':   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up':   'fade-up 0.5s ease-out both',
        'fade-in':   'fade-in 0.4s ease-out both',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'shimmer':   'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
