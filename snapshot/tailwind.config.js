/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-color)',
        surface: 'var(--surface-color)',
        main: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--border-color)',
        tag: 'var(--tag-bg)',
        code: 'var(--code-bg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};