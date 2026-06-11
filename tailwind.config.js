/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'var(--sk-chat-border, #e2e8f0)',
        input: 'var(--sk-chat-input, #e2e8f0)',
        ring: 'var(--sk-chat-ring, #2563eb)',
        background: 'var(--sk-chat-bg, #ffffff)',
        foreground: 'var(--sk-chat-fg, #0f172a)',
        primary: {
          DEFAULT: 'var(--sk-chat-primary, #2563eb)',
          foreground: 'var(--sk-chat-primary-fg, #ffffff)',
        },
        secondary: {
          DEFAULT: 'var(--sk-chat-secondary, #f1f5f9)',
          foreground: 'var(--sk-chat-secondary-fg, #0f172a)',
        },
        destructive: {
          DEFAULT: 'var(--sk-chat-destructive, #ef4444)',
          foreground: 'var(--sk-chat-destructive-fg, #ffffff)',
        },
        muted: {
          DEFAULT: 'var(--sk-chat-muted, #f8fafc)',
          foreground: 'var(--sk-chat-muted-fg, #64748b)',
        },
        accent: {
          DEFAULT: 'var(--sk-chat-accent, #f1f5f9)',
          foreground: 'var(--sk-chat-accent-fg, #0f172a)',
        },
        popover: {
          DEFAULT: 'var(--sk-chat-popover, #ffffff)',
          foreground: 'var(--sk-chat-popover-fg, #0f172a)',
        },
        card: {
          DEFAULT: 'var(--sk-chat-card, #ffffff)',
          foreground: 'var(--sk-chat-card-fg, #0f172a)',
        },
      },
      borderRadius: {
        lg: 'var(--sk-chat-radius, 8px)',
        md: 'calc(var(--sk-chat-radius, 8px) - 2px)',
        sm: 'calc(var(--sk-chat-radius, 8px) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
