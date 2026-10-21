import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

// Values come from replica/design/tokens.json (WCAG AA checked with
// replica/design/contrast.py). Pages use roles, never raw palette names:
//   surfaces  canvas, surface, surface-alt, hover, track
//   lines     line (hairlines), line-strong (control borders), line-hover
//   text      ink, muted, faint
//   brand     the Pongs ink: primary actions, links, focus, the active nav item
//   status    success / warning / danger / info, each with DEFAULT (text),
//             fill (dots, bars), soft (backgrounds) and line (borders)

// One cool neutral scale. `gray`, `stone`, `slate` and `neutral` all resolve
// to it so older class names stay consistent with the roles above.
const neutral = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e7e9ee',
  300: '#d5d9e0',
  400: '#9ca3af',
  500: '#646b78',
  600: '#4b5563',
  700: '#374151',
  800: '#1f2937',
  900: '#111827',
  950: '#0b0f17',
}

// Pongs brand: the monochrome ink of the logo. 600 is the primary action.
const brand = {
  DEFAULT: '#18181b',
  dark: '#000000',
  soft: '#f1f1f3',
  50: '#f6f6f7',
  100: '#ececef',
  200: '#d9d9de',
  300: '#a8a8b2',
  400: '#71717a',
  500: '#3f3f46',
  600: '#18181b',
  700: '#0f0f11',
  800: '#000000',
  900: '#000000',
}

const status = (text: string, fill: string, soft: string, line: string, scale: Record<string, string>) => ({
  DEFAULT: text, fill, soft, line, ...scale,
})

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
        canvas: '#f5f6f8',
        surface: { DEFAULT: '#ffffff', alt: '#f9fafb', sunken: '#f3f4f6' },
        hover: '#f3f4f6',
        track: '#eef0f3',
        line: { DEFAULT: '#e7e9ee', strong: '#d5d9e0', hover: '#9ca3af', input: '#8b93a0' },
        ink: { DEFAULT: '#111827', secondary: '#374151', muted: '#4b5563', faint: '#646b78' },
        muted: '#4b5563',
        faint: '#646b78',
        success: status('#047857', '#10b981', '#ecfdf5', '#a7f3d0', colors.emerald),
        warning: status('#92400e', '#f59e0b', '#fffbeb', '#fde68a', colors.amber),
        danger: status('#b91c1c', '#ef4444', '#fef2f2', '#fecaca', colors.red),
        info: status('#0369a1', '#0ea5e9', '#f0f9ff', '#bae6fd', colors.sky),
        emerald: colors.emerald,
        green: colors.emerald,
        rose: colors.red,
        // Older pages used `accent`; it is the brand now.
        accent: { DEFAULT: '#18181b', hover: '#000000', soft: '#f1f1f3' },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        body: ['13.5px', { lineHeight: '1.25rem' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '0.75rem',
        '3xl': '0.75rem',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(16 24 40 / 0.04)',
        sm: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 1px rgb(16 24 40 / 0.02)',
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 1px rgb(16 24 40 / 0.02)',
        DEFAULT: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 1px rgb(16 24 40 / 0.02)',
        md: '0 4px 8px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04)',
        pop: '0 12px 24px -6px rgb(16 24 40 / 0.14), 0 4px 8px -4px rgb(16 24 40 / 0.08)',
        lg: '0 12px 24px -6px rgb(16 24 40 / 0.14), 0 4px 8px -4px rgb(16 24 40 / 0.08)',
        dialog: '0 24px 48px -12px rgb(16 24 40 / 0.22), 0 8px 16px -8px rgb(16 24 40 / 0.10)',
        xl: '0 24px 48px -12px rgb(16 24 40 / 0.22), 0 8px 16px -8px rgb(16 24 40 / 0.10)',
        bar: '0 -6px 16px rgb(16 24 40 / 0.06)',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
}

export default config
