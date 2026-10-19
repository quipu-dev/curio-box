/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-color)',
        surface: {
          DEFAULT: 'var(--surface-color)',
          elevated: 'var(--surface-elevated)',
          subtle: 'var(--surface-subtle)',
          overlay: 'var(--surface-overlay)',
        },
        main: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: {
          DEFAULT: 'var(--border-color)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
          text: 'var(--accent-text)',
        },
        tag: 'var(--tag-bg)',
        code: {
          DEFAULT: 'var(--code-bg)',
          text: 'var(--code-text)',
        },
        status: {
          success: {
            DEFAULT: 'var(--status-success-text)',
            bg: 'var(--status-success-bg)',
            border: 'var(--status-success-border)',
          },
          warn: {
            DEFAULT: 'var(--status-warn-text)',
            bg: 'var(--status-warn-bg)',
            border: 'var(--status-warn-border)',
          },
          error: {
            DEFAULT: 'var(--status-error-text)',
            bg: 'var(--status-error-bg)',
            border: 'var(--status-error-border)',
          },
          info: {
            DEFAULT: 'var(--status-info-text)',
            bg: 'var(--status-info-bg)',
            border: 'var(--status-info-border)',
          },
        },
      },
    },
  },
  plugins: [],
};
