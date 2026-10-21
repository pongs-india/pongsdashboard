import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

// Values come from replica/design/tokens.json (checked for WCAG AA with
// replica/design/contrast.py). Components use roles — `bg-surface`,
// `text-muted`, `border-default` — or the scales below, never raw hex.

// One cool neutral scale for the whole product. `gray`, `stone`, `slate` and
// `neutral` all resolve to it so legacy class names stay consistent.
// 500 is the muted-text role (5.9:1 on white); 400 is for icons/placeholders.
const neutral = {
  50: '#f7f8fa',
  100: '#f0f2f5',
  200: '#e2e5ea',
  300: '#cdd2d9',
  400: '#9aa2ad',
  500: '#5d6571',
  600: '#4b525d',
  700: '#3a414b',
  800: '#262b32',
  900: '#16191e',
  950: '#0d0f12',
}

// Interactive accent: primary actions, links, selection and focus. The Pongs
// mark itself is monochrome (brand-ink); colour is reserved for meaning.
const brand = {
  50: '#eff5ff',
  100: '#dbe8fe',
  200: '#bfd5fd',
  300: '#93b8fb',
  400: '#6094f6',
  500: '#3b73ee',
  600: '#2459d8',
  700: '#1c47b4',
  800: '#1c3d92',
  900: '#1d3673',
}

// Success / positive. Kept distinct from the accent so "done" never reads as "click me".
const success = {
  50: '#ecfdf3',
  100: '#d1fadf',
  200: '#a6f4c5',
  300: '#6ce9a6',
  400: '#32d583',
  500: '#12b76a',
  600: '#079455',
  700: '#067647',
  800: '#085d3a',
  900: '#074d31',
}

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        gray: neutral,
        stone: neutral,
        slate: neutral,
        neutral,
        brand,
        emerald: success,
        green: success,
        success,
        rose: colors.red,
        // Semantic roles (tokens.json → globals.css custom properties)
        canvas: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', sunken: 'var(--surface-sunken)' },
        ink: { DEFAULT: 'var(--text)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)', subtle: 'var(--text-subtle)', brand: 'var(--brand-ink)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)', input: 'var(--border-input)' },
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', soft: 'var(--accent-soft)' },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.5rem',
        '2xl': '0.625rem',
        '3xl': '0.75rem',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(16 24 40 / 0.05)',
        sm: '0 1px 2px rgb(16 24 40 / 0.05)',
        DEFAULT: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        md: '0 4px 8px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04)',
        lg: '0 12px 24px -6px rgb(16 24 40 / 0.14), 0 4px 8px -4px rgb(16 24 40 / 0.06)',
        xl: '0 24px 48px -12px rgb(16 24 40 / 0.24)',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}

export default config
