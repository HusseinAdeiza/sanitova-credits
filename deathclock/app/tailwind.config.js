/** @type {import('tailwindcss').Config} */

// The palette is an editorial one: warm paper, near-black ink, a single
// vermilion accent, and an acid highlight reserved exclusively for verified
// on-chain state. There is no purple, no gradient mesh and no glow — the
// accent carries meaning rather than decoration.
//
// Both themes are defined as CSS custom properties in globals.css and
// consumed here as semantic names, so components are written once and work in
// either theme without a `dark:` variant on every element.
const withOpacity = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Surfaces
        canvas: withOpacity("--c-canvas"),
        surface: withOpacity("--c-surface"),
        raised: withOpacity("--c-raised"),
        // Ink
        ink: withOpacity("--c-ink"),
        muted: withOpacity("--c-muted"),
        faint: withOpacity("--c-faint"),
        // Text placed on an inverted (ink) panel, where `faint` inverts its
        // required lightness and cannot be reused.
        "on-invert": withOpacity("--c-on-invert"),
        "on-invert-strong": withOpacity("--c-on-invert-strong"),
        // Lines.
        //
        // `line` is alpha-capable for use in markup (`border-line/12`). The
        // `*-edge` tokens are opaque values for use inside @apply, which
        // cannot apply an opacity modifier to a color defined as
        // rgb(var(--x) / <alpha-value>).
        line: withOpacity("--c-line"),
        "line-edge": withOpacity("--c-line-edge"),
        "line-edge-strong": withOpacity("--c-line-edge-strong"),
        // Accents
        ember: withOpacity("--c-ember"),
        "ember-soft": withOpacity("--c-ember-soft"),
        acid: withOpacity("--c-acid"),
        "acid-soft": withOpacity("--c-acid-soft"),
        // Feedback
        positive: withOpacity("--c-positive"),
        critical: withOpacity("--c-critical"),
        warning: withOpacity("--c-warning"),
      },
      fontSize: {
        // Tight-tracked display sizes, defined so the scale stays on a rhythm
        // instead of drifting between arbitrary values.
        "display-xl": [
          "clamp(2.75rem, 7.2vw, 6.5rem)",
          { lineHeight: "0.92", letterSpacing: "-0.035em" },
        ],
        "display-lg": [
          "clamp(2.25rem, 5.2vw, 4.25rem)",
          { lineHeight: "0.95", letterSpacing: "-0.03em" },
        ],
        "display-md": [
          "clamp(1.75rem, 3.4vw, 2.75rem)",
          { lineHeight: "1.02", letterSpacing: "-0.02em" },
        ],
        "display-sm": [
          "clamp(1.375rem, 2.2vw, 1.75rem)",
          { lineHeight: "1.15", letterSpacing: "-0.015em" },
        ],
        "metric-lg": [
          "clamp(1.75rem, 3vw, 2.5rem)",
          { lineHeight: "1", letterSpacing: "-0.02em" },
        ],
        "metric-sm": ["1.125rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        micro: ["0.6875rem", { lineHeight: "1.1", letterSpacing: "0.16em" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        DEFAULT: "10px",
        md: "14px",
        lg: "20px",
        xl: "28px",
      },
      boxShadow: {
        // Single-pixel borders do the structural work; shadows only lift.
        hairline: "0 1px 0 0 rgb(var(--c-line) / 1)",
        lift: "0 1px 2px rgb(var(--c-shadow) / 0.06), 0 8px 24px -12px rgb(var(--c-shadow) / 0.14)",
        raised:
          "0 2px 4px rgb(var(--c-shadow) / 0.06), 0 18px 44px -18px rgb(var(--c-shadow) / 0.2)",
      },
      transitionTimingFunction: {
        // Slightly eased so state changes read as deliberate, not snappy.
        standard: "cubic-bezier(0.2, 0, 0, 1)",
      },
      keyframes: {
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        sweep: {
          from: { transform: "translateX(-120%)" },
          to: { transform: "translateX(320%)" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 0.4s cubic-bezier(0.2,0,0,1) both",
        "pulse-ring": "pulse-ring 2.4s ease-in-out infinite",
        sweep: "sweep 2.4s cubic-bezier(0.4,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};
