/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
      },
      colors: {
        ink: "#0d1017",
        paper: "#f2efe8",
        ember: "#f05a3c",
        acid: "#c7f36b",
        fog: "#a8a69f",
      },
      boxShadow: {
        editorial: "8px 8px 0 rgba(13, 16, 23, 0.14)",
      },
    },
  },
  plugins: [],
};
