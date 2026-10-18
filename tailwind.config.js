/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-color)',
        surface: 'var(--surface-color)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-subtle': 'var(--surface-subtle)',
        'surface-overlay': 'var(--surface-overlay)',
        main: 'var(--text-main)',
        muted: 'var(--text-muted)',
        inverse: 'var(--text-inverse)',
        border: 'var(--border-color)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        tag: 'var(--tag-bg)',
        code: 'var(--code-bg)',
        'code-text': 'var(--code-text)',
        accent: 'var(--accent-color)',
        'accent-text': 'var(--accent-text)',

        // 语义状态色（包含背景、文本与边框）
        'status-success': {
          DEFAULT: 'var(--status-success-text)',
          bg: 'var(--status-success-bg)',
          border: 'var(--status-success-border)',
        },
        'status-warn': {
          DEFAULT: 'var(--status-warn-text)',
          bg: 'var(--status-warn-bg)',
          border: 'var(--status-warn-border)',
        },
        'status-error': {
          DEFAULT: 'var(--status-error-text)',
          bg: 'var(--status-error-bg)',
          border: 'var(--status-error-border)',
        },
        'status-info': {
          DEFAULT: 'var(--status-info-text)',
          bg: 'var(--status-info-bg)',
          border: 'var(--status-info-border)',
        },
      },
    },
  },
  plugins: [],
};
